# Contributing

SPHEREx Odyssey is a strict-data backend. Contributions must respect
the no-synthetic-data invariant above all other concerns.

## Process

1. Open a GitHub issue describing the change.
2. Wait for sign-off from a maintainer on the scientific approach.
3. Implement against the issue.
4. Add a fixture if you introduce a new upstream endpoint.
5. Add an invariant test that locks the scientific contract.
6. Run the test suite and ensure all fixtures pass.

## Style

- Python 3.11+ syntax; type hints throughout.
- Dataclasses for internal typed models; Pydantic for HTTP boundaries.
- Async drivers are coroutines; URL builders are sync.
- Bounds are enforced at the URL builder, not in the driver.
- The first docstring line is a complete sentence.

## Scientific invariants

Read `SCIENTIFIC_INVARIANTS.md` first. When adding a new adapter:

1. Add the upstream service to `ADAPTER_INVENTORY.md`.
2. Document the schema with a typed model.
3. Capture a real fixture in `tests/fixtures/<service>/`.
4. Add a sidecar `.yaml` documenting the URL pattern and locks.
5. Register the fixture in `MANIFEST.json`.
6. Add an invariant test class in `tests/test_invariant_*.py`.

## Adapter checklist

- [ ] Typed scientific model (dataclass or Pydantic)
- [ ] URL builder with bounds enforcement
- [ ] Parse helper with drop-on-malformed rule
- [ ] Async driver that returns None on network failure
- [ ] Exception hierarchy with one base class
- [ ] No fabricated fallbacks
- [ ] Captured real fixture
- [ ] Manifest entry
- [ ] Invariant test class
- [ ] Added to ADAPTER_INVENTORY.md

## Testing

Run all invariant tests:

```bash
cd backend
python -m pytest tests/test_invariant_*.py -v
```

If the dev environment has the pydantic-core mismatch, use the
source-of-truth check:

```bash
python -m py_compile $(find . -name '*.py' -not -path './scratch/*' -not -path './.venv/*')
```

## Pull request review

Each PR must:

1. Reference the GitHub issue.
2. Include the new fixture path.
3. Show the invariant test passing.
4. Pass the manifest hash check.

A PR that introduces a fixture body change must include a comment
explaining why the upstream response changed and how it was re-validated.
