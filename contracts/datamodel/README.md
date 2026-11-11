# Data model (reference)

The technology-independent data model for machine tools is developed by the umati community in its own
repository. This repository does not contain it. It refers to one exact version:

| | |
|---|---|
| Repository | <https://github.com/umati/MachineTool-DataModel> |
| Branch | `spec/draft-v0.2` |
| Commit | `9094a16b89a26558d024a3cf948d247b6aa09179` |
| Version | 0.8.0 |

The model is a draft. Its repository may require access; the umati data model working group grants it.

```bash
git clone --branch spec/draft-v0.2 https://github.com/umati/MachineTool-DataModel.git
git -C MachineTool-DataModel checkout 9094a16b89a26558d024a3cf948d247b6aa09179
```

- The model is not covered by the licences of this repository.
- The [MQTT binding](../mqtt/README.md) says how this repository uses the model and names every deviation.
- A new version of the model arrives as a pull request that changes the table above and, where needed, the
  binding. See [ADR-0006](../../docs/adr/0006-data-model-by-reference.md).
