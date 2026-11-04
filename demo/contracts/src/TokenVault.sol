// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./IERC20.sol";
import {PriceOracle} from "./PriceOracle.sol";

/// @title TokenVault
/// @notice Holds ETH and one ERC-20 token for depositors. Charges a fee on withdrawal.
/// @dev DEMO CONTRACT WITH PLANTED BUGS. Do not deploy.
contract TokenVault {
    IERC20 public immutable token;
    PriceOracle public immutable oracle;
    address public owner;
    address public feeRecipient;
    uint256 public feeBps = 30; // 0.30%

    mapping(address => uint256) public ethBalance;
    mapping(address => uint256) public tokenBalance;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    constructor(IERC20 _token, PriceOracle _oracle, address _feeRecipient) {
        token = _token;
        oracle = _oracle;
        owner = msg.sender;
        feeRecipient = _feeRecipient;
    }

    function depositEth() external payable {
        ethBalance[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    // PLANTED (H-01): reentrancy. The external call happens before the balance is cleared.
    function withdrawEth() external {
        uint256 amount = ethBalance[msg.sender];
        require(amount > 0, "nothing to withdraw");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
        ethBalance[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
    }

    function depositToken(uint256 amount) external {
        // PLANTED (M-01): return value of transferFrom is ignored.
        token.transferFrom(msg.sender, address(this), amount);
        tokenBalance[msg.sender] += amount;
    }

    function withdrawToken(uint256 amount) external {
        require(tokenBalance[msg.sender] >= amount, "insufficient");
        require(oracle.isFresh(), "stale price");
        tokenBalance[msg.sender] -= amount;
        // PLANTED (L-01): divide before multiply loses precision on the fee.
        uint256 fee = (amount / 10_000) * feeBps;
        // PLANTED (M-01): return values of transfer are ignored.
        token.transfer(feeRecipient, fee);
        token.transfer(msg.sender, amount - fee);
    }

    // PLANTED (H-02): missing access control. Anyone can redirect fees to themselves.
    function setFeeRecipient(address newRecipient) external {
        // PLANTED (L-02): no zero-address check.
        feeRecipient = newRecipient;
    }

    // PLANTED (H-03): tx.origin used for authorization.
    function emergencyWithdraw(address payable to) external {
        require(tx.origin == owner, "not owner");
        to.transfer(address(this).balance);
    }
}
