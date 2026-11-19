# Data model (reference)

The technology-independent data model for machine tools is developed by the umati community in its own
repository. This repository does not contain it. It refers to one exact version:

| | |
|---|---|
| Repository | <https://github.com/umati/MachineTool-DataModel> |
| Branch | `spec/draft-v0.2` |
| Commit | `3a799d5a85759663c0d73d7d9f8d3d56955b1461` |
| Version | 0.17.1 |

The model is a draft. Its repository may require access; the umati data model working group grants it.

```bash
git clone --branch spec/draft-v0.2 https://github.com/umati/MachineTool-DataModel.git
git -C MachineTool-DataModel checkout 3a799d5a85759663c0d73d7d9f8d3d56955b1461
```

- The model is not covered by the licences of this repository.
- The [MQTT binding](../mqtt/README.md) says how this repository uses the model and names every deviation.
- The simulator publishes exactly after the model, below `machines/{MachineId}/`: see "Machines" in the
  [MQTT binding](../mqtt/README.md#machines-the-binding-of-the-data-model). Its tests check every message against the schemas of the
  model when a clone of it lies next to this repository (or in the folder named by `UMATI_DATAMODEL_DIR`).
- A new version of the model arrives as a pull request that changes the table above and, where needed, the
  binding. See [ADR-0006](../../docs/adr/0006-data-model-by-reference.md).
