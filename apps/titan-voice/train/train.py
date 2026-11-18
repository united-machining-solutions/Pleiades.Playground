"""Runs `piper.train fit` without a network: no quality model is downloaded during the checks.

Piper rates its test sentences with UTMOS, which torch.hub fetches from the internet, and keeps the best
checkpoints by that rating. Offline the rating is missing and Lightning stops the training. This runs the
same training with the rating left out (pass `--model.mos_metric none`); the checkpoints kept by `val_mel`
and `last.ckpt` stay. Takes the same arguments as `python -m piper.train fit`.

    python train.py fit --model.mos_metric none ...
"""

from piper.train import __main__ as piper_train

_defaults = piper_train._default_callbacks


def _offline_callbacks() -> list:
    return [callback for callback in _defaults() if getattr(callback, "monitor", None) != "val_mos"]


piper_train._default_callbacks = _offline_callbacks

if __name__ == "__main__":
    piper_train.main()
