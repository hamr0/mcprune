# Definition of Done

A change is done when:

## Code quality

- [ ] All existing tests pass (`npm test`)
- [ ] New functionality has tests
- [ ] No regressions in token reduction benchmarks
- [ ] Round-trip safety maintained: `parse(prune(fixture))` does not throw for all fixtures

## Pruning correctness

- [ ] All `[ref=eN]` markers preserved in pruned output
- [ ] Interactive elements (buttons, links, textboxes, etc.) not dropped
- [ ] Prices, stock status, and short labels preserved
- [ ] No false positives in snapshot detection (non-snapshot text not pruned)

## Proxy correctness

- [ ] All JSON-RPC messages forwarded without corruption
- [ ] Context tracking updates on browser_type and browser_navigate
- [ ] Stats header format: `[mcprune: X% reduction, ~N -> ~M tokens | summary]`

## Performance

- [ ] Test suite runs in <5 seconds
- [ ] Pruning achieves >70% reduction on Amazon product fixture
- [ ] No new dependencies added without justification
