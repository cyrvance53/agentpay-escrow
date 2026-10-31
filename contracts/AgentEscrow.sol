// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title AgentEscrow
/// @notice Trust-minimised escrow for agent-to-agent (A2A) jobs.
///
/// Flow:
///   1. A poster agent creates a job and locks the payment in this contract.
///   2. The worker agent does the job and records a deliverable hash on-chain.
///   3. Happy path: the poster approves and the escrow settles to the worker.
///   4. Dispute path: either side can dispute; a named arbiter agent resolves —
///      funds release to the worker or refund to the poster.
///   5. Safety valve: if the worker never delivers, the poster can reclaim the
///      funds after the deadline.
///
/// The contract is deliberately small and dependency-free so it can be audited
/// at a glance. It is a hackathon prototype, not production software.
contract AgentEscrow {
    enum State {
        Funded,    // payment locked, work not yet delivered
        Delivered, // worker recorded a deliverable hash
        Settled,   // payment released to the worker
        Disputed,  // either party escalated; arbiter decides
        Refunded   // payment returned to the poster
    }

    struct Job {
        address poster;
        address worker;
        address arbiter;
        address token; // ERC-20 used for settlement (address(0) not supported)
        uint256 amount;
        uint256 deadline; // unix seconds; delivery must happen by then
        bytes32 deliverableHash;
        State state;
    }

    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address indexed poster, address indexed worker, address token, uint256 amount, uint256 deadline);
    event JobDelivered(uint256 indexed jobId, bytes32 deliverableHash);
    event JobSettled(uint256 indexed jobId, address indexed worker, uint256 amount);
    event JobDisputed(uint256 indexed jobId, address indexed raisedBy);
    event JobRefunded(uint256 indexed jobId, address indexed poster, uint256 amount);
    event DisputeResolved(uint256 indexed jobId, bool releasedToWorker);

    modifier onlyJobParty(uint256 jobId) {
        Job storage job = jobs[jobId];
        require(
            msg.sender == job.poster || msg.sender == job.worker,
            "Escrow: not a job party"
        );
        _;
    }

    /// @notice Create a job and lock `amount` of `token` in escrow.
    /// @dev The poster must have approved this contract to spend `amount` first.
    function createJob(
        address worker,
        address arbiter,
        address token,
        uint256 amount,
        uint256 deadline
    ) external returns (uint256 jobId) {
        require(worker != address(0), "Escrow: worker is zero address");
        require(arbiter != address(0), "Escrow: arbiter is zero address");
        require(token != address(0), "Escrow: token is zero address");
        require(amount > 0, "Escrow: amount is zero");
        require(deadline > block.timestamp, "Escrow: deadline in the past");

        jobId = ++jobCount;
        jobs[jobId] = Job({
            poster: msg.sender,
            worker: worker,
            arbiter: arbiter,
            token: token,
            amount: amount,
            deadline: deadline,
            deliverableHash: bytes32(0),
            state: State.Funded
        });

        require(
            IERC20Minimal(token).transferFrom(msg.sender, address(this), amount),
            "Escrow: deposit transfer failed"
        );

        emit JobCreated(jobId, msg.sender, worker, token, amount, deadline);
    }

    /// @notice Worker records the deliverable (a content hash of the work product).
    function markDelivered(uint256 jobId, bytes32 deliverableHash) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.worker, "Escrow: only the worker can deliver");
        require(job.state == State.Funded, "Escrow: job not in Funded state");
        require(deliverableHash != bytes32(0), "Escrow: empty deliverable hash");

        job.deliverableHash = deliverableHash;
        job.state = State.Delivered;
        emit JobDelivered(jobId, deliverableHash);
    }

    /// @notice Poster accepts the delivery; escrow settles to the worker.
    function approveAndSettle(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.poster, "Escrow: only the poster can settle");
        require(job.state == State.Delivered, "Escrow: job not in Delivered state");

        job.state = State.Settled;
        require(
            IERC20Minimal(job.token).transfer(job.worker, job.amount),
            "Escrow: settlement transfer failed"
        );
        emit JobSettled(jobId, job.worker, job.amount);
    }

    /// @notice Either party can escalate a funded or delivered job to the arbiter.
    function raiseDispute(uint256 jobId) external onlyJobParty(jobId) {
        Job storage job = jobs[jobId];
        require(
            job.state == State.Funded || job.state == State.Delivered,
            "Escrow: job cannot be disputed now"
        );
        job.state = State.Disputed;
        emit JobDisputed(jobId, msg.sender);
    }

    /// @notice Arbiter resolves a dispute: release to worker or refund poster.
    function resolveDispute(uint256 jobId, bool releaseToWorker) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.arbiter, "Escrow: only the arbiter can resolve");
        require(job.state == State.Disputed, "Escrow: job not in Disputed state");

        if (releaseToWorker) {
            job.state = State.Settled;
            require(
                IERC20Minimal(job.token).transfer(job.worker, job.amount),
                "Escrow: settlement transfer failed"
            );
            emit JobSettled(jobId, job.worker, job.amount);
        } else {
            job.state = State.Refunded;
            require(
                IERC20Minimal(job.token).transfer(job.poster, job.amount),
                "Escrow: refund transfer failed"
            );
            emit JobRefunded(jobId, job.poster, job.amount);
        }
        emit DisputeResolved(jobId, releaseToWorker);
    }

    /// @notice If the worker never delivers, the poster reclaims funds after the deadline.
    function refundAfterDeadline(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.poster, "Escrow: only the poster can reclaim");
        require(job.state == State.Funded, "Escrow: job not in Funded state");
        require(block.timestamp > job.deadline, "Escrow: deadline not reached yet");

        job.state = State.Refunded;
        require(
            IERC20Minimal(job.token).transfer(job.poster, job.amount),
            "Escrow: refund transfer failed"
        );
        emit JobRefunded(jobId, job.poster, job.amount);
    }

    /// @notice Read a job in full.
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }
}
