/** The build the app was made from, as `vite.config.ts` writes it in. */
export interface Build {
  /** `0.0.<run>` from the workflow "Images", `1.2.3` from a version tag, "dev" from any other build. */
  version: string
  /** The full commit, or "" where the build did not know it. */
  revision: string
  /** The repository, such as `https://github.com/<owner>/<repo>`, or "" where the build did not know it. */
  source: string
}

/**
 * What the sidebar shows: the version and the short commit, so that two stacks can be told apart, and a
 * link to the commit where the build knows its repository.
 */
export function versionOf(build: Build): { label: string; href?: string } {
  const commit = build.revision.slice(0, 7)
  return {
    label: commit ? `${build.version} · ${commit}` : build.version,
    href: commit && build.source ? `${build.source}/commit/${build.revision}` : undefined,
  }
}
