# Data model (reference)

The technology-independent data model for machine tools is developed by the umati community in its own
repository. This repository does not contain it. It refers to one exact version:

| | |
|---|---|
| Repository | <https://github.com/umati/MachineTool-DataModel> |
| Branch | `spec/draft-v0.2` |
| Commit | `0be264c1c28e1d0f1bb9eecc515d2afaf54b107a` |
| Version | 0.15.0 |

The model is a draft. Its repository may require access; the umati data model working group grants it.
The commit of 0.15.0 is public only once it is pushed to `spec/draft-v0.2`; until then the checkout above
fails outside the working group.

```bash
git clone --branch spec/draft-v0.2 https://github.com/umati/MachineTool-DataModel.git
git -C MachineTool-DataModel checkout 0be264c1c28e1d0f1bb9eecc515d2afaf54b107a
```

- The model is not covered by the licences of this repository.
- The [MQTT binding](../mqtt/README.md) says how this repository uses the model and names every deviation.
- The simulator can publish exactly after the model, below `simulators/{SerialNumber}/`: see "Spec binding" in the
  [MQTT binding](../mqtt/README.md#spec-binding-draft). Its tests check every message against the schemas of the
  model when a clone of it lies next to this repository (or in the folder named by `UMATI_DATAMODEL_DIR`).
- A new version of the model arrives as a pull request that changes the table above and, where needed, the
  binding. See [ADR-0006](../../docs/adr/0006-data-model-by-reference.md).
