# Vault v2 audit

**Auditor:** AuditGate demo (internal review)
**Commit:** to be filled in after the demo repo is pushed to Bitbucket
**Scope:**

- src/TokenVault.sol
- src/PriceOracle.sol
- src/RewardsDistributor.sol

This is a sample report for the AuditGate demo. The contracts in `demo/contracts` contain these bugs on purpose. Five of them have a Foundry test in `demo/contracts/test/Exploits.t.sol` that proves the bug.

Summary: 1 Critical, 3 High, 3 Medium, 3 Low, 1 Gas.

## [C-01] Anyone can set the oracle price

### Severity: Critical

### Location: src/PriceOracle.sol#L21-L25

### Contract: PriceOracle

### Function: setPrice

### Description

`setPrice` has no access control. Any address can set the price to any value. The vault reads this oracle in `withdrawToken`, so an attacker can move the price at will. Neither Slither nor Aderyn reports this. It was found by manual review.

Proved by `test_C01_anyoneCanSetPrice`.

### Recommendation

Restrict `setPrice` to the owner, or to a list of approved price feeders. Emit the old and new price in the event.

## [H-01] Reentrancy in withdrawEth lets a depositor drain the vault

### Severity: High

### Location: src/TokenVault.sol#L36-L43

### Contract: TokenVault

### Function: withdrawEth

### Description

`withdrawEth` sends ETH with a low-level `call` and only then sets the caller's balance to zero. A contract that re-enters `withdrawEth` from its `receive` function is paid its balance again on every call until the vault is empty.

In `test_H01_reentrancyDrainsVault` an attacker deposits 1 ETH and leaves with 5 ETH.

### Recommendation

Set `ethBalance[msg.sender] = 0` before the external call (checks-effects-interactions), and add a reentrancy guard.

## [H-02] Anyone can redirect withdrawal fees

### Severity: High

### Location: src/TokenVault.sol#L63-L66

### Contract: TokenVault

### Function: setFeeRecipient

### Description

`setFeeRecipient` has no access control. Any address can make itself the fee recipient and collect every future withdrawal fee. Neither Slither nor Aderyn reports this.

Proved by `test_H02_anyoneCanRedirectFees`.

### Recommendation

Restrict the function to the owner and emit an event when the recipient changes.

## [H-03] tx.origin used to authorize emergencyWithdraw

### Severity: High

### Location: src/TokenVault.sol#L69-L72

### Contract: TokenVault

### Function: emergencyWithdraw

### Description

`emergencyWithdraw` checks `tx.origin == owner`. If the owner calls any malicious contract, that contract can call `emergencyWithdraw` and send the whole ETH balance to an address it picks.

### Recommendation

Use `msg.sender == owner`. Consider removing the function, or putting it behind a timelock.

## [M-01] ERC-20 return values are ignored in the vault

### Severity: Medium

### Location: src/TokenVault.sol#L45-L60

### Contract: TokenVault

### Function: depositToken

### Description

`depositToken` ignores the return value of `transferFrom`, and `withdrawToken` ignores the return values of both `transfer` calls. Some tokens return `false` on failure instead of reverting. With such a token, a user can be credited a deposit they never paid.

Proved by `test_M01_failedTransferStillCredits`.

### Recommendation

Use a safe-transfer wrapper that reverts on `false` or on missing return data.

## [M-02] Unbounded loop in distribute

### Severity: Medium

### Location: src/RewardsDistributor.sol#L31-L40

### Contract: RewardsDistributor

### Function: distribute

### Description

`distribute` loops over every registered staker in one transaction. Registration is open to anyone, so the list can grow until `distribute` costs more gas than a block allows. Rewards are then stuck.

### Recommendation

Switch to a pull model where each staker claims their own share, or distribute in fixed-size batches.

## [M-03] Unchecked reward transfer inside the distribute loop

### Severity: Medium

### Location: src/RewardsDistributor.sol#L38

### Contract: RewardsDistributor

### Function: distribute

### Description

The return value of `rewardToken.transfer` is ignored inside the loop. A failed transfer is silent, and that staker's share is lost for this round.

### Recommendation

Revert on failure, or record the unpaid amount so the staker can claim it later.

## [L-01] Division before multiplication loses precision

### Severity: Low

### Location: src/TokenVault.sol#L56, src/RewardsDistributor.sol#L36

### Contract: TokenVault

### Function: withdrawToken

### Description

The fee is computed as `(amount / 10_000) * feeBps`. Any withdrawal under 10,000 units pays no fee. The same pattern in `RewardsDistributor.distribute` rounds every share down to a multiple of `pot / totalStake`.

Proved by `test_L01_smallWithdrawalsPayNoFee`.

### Recommendation

Multiply first: `amount * feeBps / 10_000`.

## [L-02] No zero-address check on fee recipient

### Severity: Low

### Location: src/TokenVault.sol#L63-L66

### Contract: TokenVault

### Function: setFeeRecipient

### Description

`setFeeRecipient` and the constructor accept `address(0)`. Fees sent there are burned.

### Recommendation

Revert when the new recipient is `address(0)`.

## [L-03] Price freshness depends on block.timestamp

### Severity: Low

### Location: src/PriceOracle.sol#L28-L30

### Contract: PriceOracle

### Function: isFresh

### Description

`isFresh` compares `block.timestamp` with `updatedAt` using a one-hour window. Validators can shift timestamps by a few seconds, which matters only near the edge of the window. Low impact, noted for completeness.

### Recommendation

Accept the small drift, or widen the window and document it.

## [G-01] State variables that never change are not immutable or constant

### Severity: Gas

### Location: src/TokenVault.sol#L13-L15

### Contract: TokenVault

### Description

`TokenVault.owner`, `PriceOracle.owner` and `RewardsDistributor.owner` are only set in the constructor and could be `immutable`. `TokenVault.feeBps` never changes and could be `constant`.

### Recommendation

Mark them `immutable` or `constant` to save a storage read on every access.
