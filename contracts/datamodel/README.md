# Data model (reference)

The technology-independent data model for machine tools is developed by the umati community in its own
repository. This repository does not contain it. It refers to one exact version:

| | |
|---|---|
| Repository | <https://github.com/umati/MachineTool-DataModel> |
| Branch | `spec/draft-v0.2` |
| Commit | `2b45df3f4f3faeb799ddcc904332129f93fdcd9e` |
| Version | 0.13.1 |

The model is a draft. Its repository may require access; the umati data model working group grants it.

```bash
git clone --branch spec/draft-v0.2 https://github.com/umati/MachineTool-DataModel.git
git -C MachineTool-DataModel checkout 2b45df3f4f3faeb799ddcc904332129f93fdcd9e
```

- The model is not covered by the licences of this repository.
- The [MQTT binding](../mqtt/README.md) says how this repository uses the model and names every deviation.
- The simulator can publish exactly after the model, below `umati/{machineId}/`: see "Spec binding" in the
  [MQTT binding](../mqtt/README.md#spec-binding-draft). Its tests check every message against the schemas of the
  model when a clone of it lies next to this repository (or in the folder named by `UMATI_DATAMODEL_DIR`).
- A new version of the model arrives as a pull request that changes the table above and, where needed, the
  binding. See [ADR-0006](../../docs/adr/0006-data-model-by-reference.md).
