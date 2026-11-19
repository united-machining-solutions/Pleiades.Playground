#!/usr/bin/env python3
"""Runs sfh/app-definition.json on this computer with Docker, the way the SFH runs it: one pod.

Every container joins the network namespace of one holder container, so they reach each other on 127.0.0.1
as in the pod, and a port taken twice fails here as it would there. The values are rendered as the SFH renders
them ({{ .Values.sfhId }}, {{ .Values.app.<name> }}), volumes become Docker volumes, a configMap a read-only
folder. Probes are emulated once: a startupProbe is run until it passes, then each readinessProbe is checked.
An exec probe runs in its container; an httpGet or tcpSocket probe goes to the pod IP, as the kubelet sends it.

  sfh/run-local.py up   [--prefix pleiades-sfh] [--sfh-id local] [--set name=value ...]
  sfh/run-local.py check
  sfh/run-local.py down
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent
PROJECT = "pleiades-sfh-local"
HOLDER = f"{PROJECT}-pod"


def docker(*args, check=True, capture=False):
    return subprocess.run(["docker", *args], check=check, text=True,
                          capture_output=capture)


def render(text, sfh_id, values):
    # The values the cluster-worker sets at a deployment, as far as a definition uses them.
    cluster = {"sfhId": sfh_id, "sponsorId": "local", "sponsorRef": "LOCAL", "basedomain": "sfh.edge-device.net"}

    def sub(m):
        key, pipe = m.group(1), m.group(2)
        value = values[key[4:]] if key.startswith("app.") else cluster[key]
        return value.lower() if pipe == "lower" else value
    return re.sub(r"\{\{\s*\.Values\.([A-Za-z.]+)\s*(?:\|\s*(lower)\s*)?\}\}", sub, text)


def memory(quantity):
    number, unit = re.fullmatch(r"(\d+)([A-Za-z]*)", quantity).groups()
    return number + {"Mi": "m", "Gi": "g", "Ki": "k", "M": "m", "G": "g", "k": "k"}[unit]


def load():
    return json.loads((ROOT / "app-definition.json").read_text())


def up(a):
    definition = load()
    values = {v["name"]: v["value"] for v in definition.get("values", [])}
    for pair in a.set or []:
        name, value = pair.split("=", 1)
        values[name] = value

    down(a, quiet=True)
    published = [p["containerPort"] for c in definition["containers"] for p in c.get("ports", [])]
    holder_image = next(f"{a.prefix}/{c['image']}:{c['tag']}" for c in definition["containers"]
                        if c["image"] == "pleiades.playground.app")
    docker("run", "-d", "--name", HOLDER, "--label", f"sfh-local={PROJECT}",
           *sum((["-p", f"127.0.0.1:{p}:{p}"] for p in published), []),
           "--entrypoint", "sleep", holder_image, "infinity")

    config_dir = pathlib.Path(tempfile.mkdtemp(prefix=f"{PROJECT}-"))
    mounts = {}
    for v in definition.get("volumes", []):
        if v["type"] == "configMap":
            folder = config_dir / v["name"]
            folder.mkdir()
            for name, content in v["configMapData"].items():
                (folder / name).write_text(render(content, a.sfh_id, values))
            mounts[v["name"]] = ("bind", str(folder))
        else:
            volume = f"{PROJECT}-{v['name']}"
            docker("volume", "create", "--label", f"sfh-local={PROJECT}", volume, capture=True)
            mounts[v["name"]] = ("volume", volume)

    for c in definition["containers"]:
        cmd = ["run", "-d", "--name", f"{PROJECT}-{c['name']}", "--label", f"sfh-local={PROJECT}",
               "--network", f"container:{HOLDER}", "--restart", "unless-stopped",
               "--memory", memory(c["resources"]["limits"]["memory"])]
        for e in c.get("environment", []):
            cmd += ["-e", f"{e['name']}={render(e['value'], a.sfh_id, values)}"]
        for m in c.get("volumeMounts", []):
            kind, source = mounts[m["name"]]
            if m.get("subPath"):
                source = f"{source}/{m['subPath']}"
            options = f"type={kind},source={source},target={m['mountPath']}"
            cmd += ["--mount", options + (",readonly" if m.get("readOnly") else "")]
        command = [render(x, a.sfh_id, values) for x in c.get("command", [])]
        args = [render(x, a.sfh_id, values) for x in c.get("args", [])]
        if command:
            cmd += ["--entrypoint", command[0]]
        cmd += [f"{a.prefix}/{c['image']}:{c['tag']}", *command[1:], *args]
        docker(*cmd, capture=True)
        print(f"started {c['name']}")
    return check(a)


def pod_ip():
    """The address of the pod. The kubelet sends an httpGet or tcpSocket probe there, not to 127.0.0.1, so a
    process that listens on 127.0.0.1 only fails such a probe on the SFH, and here as well."""
    return docker("inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", HOLDER,
                  capture=True).stdout.strip()


def probe(container, p):
    if "exec" in p:
        r = docker("exec", f"{PROJECT}-{container}", *p["exec"]["command"], check=False, capture=True)
    elif "httpGet" in p:
        url = f"http://{pod_ip()}:{p['httpGet']['port']}{p['httpGet']['path']}"
        r = docker("exec", HOLDER, "wget", "-qO", "/dev/null", "-T", "5", url, check=False, capture=True)
    else:
        r = docker("exec", HOLDER, "nc", "-z", "-w", "3", pod_ip(), str(p["tcpSocket"]["port"]),
                   check=False, capture=True)
    return r.returncode == 0


def check(a):
    definition = load()
    deadline = time.time() + 300
    for c in definition["containers"]:
        if "startupProbe" in c:
            while not probe(c["name"], c["startupProbe"]):
                if time.time() > deadline:
                    print(f"startupProbe of {c['name']} did not pass")
                    return 1
                time.sleep(c["startupProbe"].get("periodSeconds", 10))
            print(f"startup   ok  {c['name']}")
    failed = []
    for c in definition["containers"]:
        for kind in ("readinessProbe", "livenessProbe"):
            if kind not in c:
                continue
            while not probe(c["name"], c[kind]):
                if time.time() > deadline:
                    failed.append(f"{c['name']} {kind}")
                    break
                time.sleep(3)
            else:
                print(f"{kind[:-5]:9} ok  {c['name']}")
    for f in failed:
        print(f"FAILED    {f}")
    return 1 if failed else 0


def down(a, quiet=False):
    ids = docker("ps", "-aq", "--filter", f"label=sfh-local={PROJECT}", capture=True).stdout.split()
    if ids:
        docker("rm", "-f", *ids, capture=True)
    vols = docker("volume", "ls", "-q", "--filter", f"label=sfh-local={PROJECT}", capture=True).stdout.split()
    if vols:
        docker("volume", "rm", *vols, capture=True)
    if not quiet:
        print(f"removed {len(ids)} containers, {len(vols)} volumes")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["up", "check", "down"])
    parser.add_argument("--prefix", default="pleiades-sfh")
    parser.add_argument("--sfh-id", default="local")
    parser.add_argument("--set", action="append", help="name=value of a value of the app")
    a = parser.parse_args()
    sys.exit({"up": up, "check": check, "down": down}[a.action](a))


if __name__ == "__main__":
    main()
