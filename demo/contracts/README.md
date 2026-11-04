# vault-v2 (AuditGate demo contracts)

A small Foundry project with bugs planted on purpose. It is the "audited repo" in the AuditGate demo. **Do not deploy any of this.**

| File                         | In audit scope | What it does                                               |
| ---------------------------- | -------------- | ---------------------------------------------------------- |
| `src/TokenVault.sol`         | yes            | Holds ETH and one ERC-20 token, charges a withdrawal fee   |
| `src/PriceOracle.sol`        | yes            | Stores the token price the vault checks before withdrawals |
| `src/RewardsDistributor.sol` | yes            | Splits a reward pot between stakers                        |
| `src/IERC20.sol`             | no             | Interface only                                             |
| `test/Exploits.t.sol`        | no             | One test per bug that proves it is real                    |

## Planted bugs

| ID   | Severity | Bug                                          | Found by Slither        | Found by Aderyn | Proved by test |
| ---- | -------- | -------------------------------------------- | ----------------------- | --------------- | -------------- |
| C-01 | Critical | Anyone can set the oracle price              | no                      | no              | yes            |
| H-01 | High     | Reentrancy in `withdrawEth`                  | yes                     | yes             | yes            |
| H-02 | High     | Anyone can redirect fees                     | no                      | no              | yes            |
| H-03 | High     | `tx.origin` auth in `emergencyWithdraw`      | yes (Medium)            | yes             |                |
| M-01 | Medium   | Unchecked ERC-20 return values in the vault  | yes (High)              | yes (Low)       | yes            |
| M-02 | Medium   | Unbounded loop in `distribute`               | yes (`calls-loop`, Low) | no              |                |
| M-03 | Medium   | Unchecked transfer inside the loop           | yes (High)              | yes (Low)       |                |
| L-01 | Low      | Divide before multiply                       | yes (Medium)            | no              | yes            |
| L-02 | Low      | No zero-address check on fee recipient       | yes                     | yes             |                |
| L-03 | Low      | `block.timestamp` freshness window           | yes                     | no              |                |
| G-01 | Gas      | State that could be `immutable` / `constant` | yes                     | yes             |                |

Two of the four worst bugs (C-01, H-02) are missing access control. Neither tool reports them. The full write-up is in [`../reports/vault-v2-audit.md`](../reports/vault-v2-audit.md).

## Run

```sh
forge build
forge test -vv
slither . --filter-paths "test/" --json slither.json
aderyn . -o aderyn.json
```

The committed outputs in `demo/reports/` came from Slither 0.11.6, Aderyn 0.6.8 and solc 0.8.24.
