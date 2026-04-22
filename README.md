# SJMCL-ext-update-test

A small SJMCL extension repo derived from the `org.sjmcl.quick_notes` example and turned into a GitHub Release update-check demo.

## What it does

- renders a Home Widget inside SJMCL
- reads its local `sjmcl.ext.json`
- requests the repo's GitHub `releases/latest`
- downloads the release asset `sjmcl.ext.json`
- compares `version` with a SemVer-aware comparator
- shows whether an update is available
- exposes both the release page and manifest asset from the widget

## Release assets

Each release uploads:

- `sjmcl.ext.json`
- `icon.png`
- `org.sjmcl.release_update_test-<version>.sjmclx`

## Build the release bundle

```bash
./scripts/package-release.sh
```
