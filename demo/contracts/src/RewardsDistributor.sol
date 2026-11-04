// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./IERC20.sol";

/// @title RewardsDistributor
/// @notice Splits a reward pot between registered stakers in proportion to their stake.
/// @dev DEMO CONTRACT WITH PLANTED BUGS. Do not deploy.
contract RewardsDistributor {
    IERC20 public immutable rewardToken;
    address public owner;

    address[] public stakers;
    mapping(address => uint256) public stakeOf;
    uint256 public totalStake;

    constructor(IERC20 _rewardToken) {
        rewardToken = _rewardToken;
        owner = msg.sender;
    }

    function register(uint256 stake) external {
        if (stakeOf[msg.sender] == 0) {
            stakers.push(msg.sender);
        }
        stakeOf[msg.sender] += stake;
        totalStake += stake;
    }

    // PLANTED (M-02): unbounded loop over every staker. Enough stakers and this runs out of gas.
    function distribute(uint256 pot) external {
        require(msg.sender == owner, "not owner");
        for (uint256 i = 0; i < stakers.length; i++) {
            address s = stakers[i];
            // PLANTED (L-01 pattern repeated): divide before multiply.
            uint256 share = (pot / totalStake) * stakeOf[s];
            // PLANTED (M-03): return value ignored inside the loop.
            rewardToken.transfer(s, share);
        }
    }

    function stakerCount() external view returns (uint256) {
        return stakers.length;
    }
}
