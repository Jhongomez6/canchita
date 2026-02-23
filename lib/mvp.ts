import type { Match } from "./domain/match";
import type { Player } from "./domain/player";
import type { Guest } from "./domain/guest";

export interface MvpStatus {
    topMvpScore: number;
    currentMVPs: string[]; // UIDs or guest names
    winnerNames: string[]; // Display names
    mathematicallyClosed: boolean;
    timeLimitClosed: boolean;
    allEligibleVoted: boolean;
    votingClosed: boolean;
    sortedMVPLeaderboard: [string, number][];
    voteCounts: Record<string, number>;
}

export function calculateMvpStatus(match: Match | null | undefined): MvpStatus {
    const defaultStatus: MvpStatus = {
        topMvpScore: 0,
        currentMVPs: [],
        winnerNames: [],
        mathematicallyClosed: false,
        timeLimitClosed: false,
        allEligibleVoted: false,
        votingClosed: false,
        sortedMVPLeaderboard: [],
        voteCounts: {},
    };

    if (!match) return defaultStatus;

    const isClosed = match.status === "closed";

    // Calculate Leaderboard
    const voteCounts: Record<string, number> = {};
    if (match.mvpVotes) {
        Object.values(match.mvpVotes).forEach((votedId) => {
            voteCounts[votedId as string] = (voteCounts[votedId as string] || 0) + 1;
        });
    }

    const sortedMVPLeaderboard = Object.entries(voteCounts).sort(([, a], [, b]) => b - a);
    const topMvpScore = sortedMVPLeaderboard.length > 0 ? sortedMVPLeaderboard[0][1] : 0;
    const secondHighestScore = sortedMVPLeaderboard.length > 1 ? sortedMVPLeaderboard[1][1] : 0;

    const currentMVPs = sortedMVPLeaderboard
        .filter(([, score]) => score === topMvpScore && score > 0)
        .map(([id]) => id);

    // Resolution of winner names
    const winnerNames: string[] = [];
    const allPlayersAndGuests = [
        ...(match.players || []),
        ...(match.guests || []).map((g: Guest) => ({ uid: `guest_${g.name}`, name: g.name }))
    ];

    for (const mvpId of currentMVPs) {
        const p = allPlayersAndGuests.find((p: any) => p.uid === mvpId || p.name === mvpId);
        if (p) winnerNames.push(p.name);
    }

    // Strict Mathematical Consensus Validation based on unique physical accounts
    const eligibleUIDs = new Set(
        match.players?.filter((p: Player) => p.confirmed && p.uid && !p.uid.startsWith("guest_")).map((p: Player) => p.uid as string) || []
    );
    if (match.createdBy) eligibleUIDs.add(match.createdBy); // Admin can always vote

    const totalEligibleVoters = eligibleUIDs.size;
    const votesCast = match.mvpVotes ? Object.keys(match.mvpVotes).filter(uid => eligibleUIDs.has(uid)).length : 0;
    const remainingVotes = totalEligibleVoters - votesCast;

    // A player has mathematically won if their score is strictly greater than the 
    // second highest score plus all remaining possible votes.
    const mathematicallyClosed = (topMvpScore > 0) && (topMvpScore > secondHighestScore + remainingVotes);

    // Voting is also definitively closed if every single eligible player has voted, 
    // regardless of ties.
    const allEligibleVoted = totalEligibleVoters > 0 && remainingVotes <= 0;

    // 5h Voting Window Validation
    const closedTime = match.closedAt ? new Date(match.closedAt).getTime() : 0;
    const now = new Date().getTime();
    const hoursSinceClosed = closedTime ? (now - closedTime) / (1000 * 60 * 60) : 0;
    const timeLimitClosed = hoursSinceClosed > 5;

    const earlyClosure = mathematicallyClosed || allEligibleVoted;
    const votingClosed = isClosed && (timeLimitClosed || earlyClosure);

    return {
        topMvpScore,
        currentMVPs,
        winnerNames,
        mathematicallyClosed,
        timeLimitClosed,
        allEligibleVoted,
        votingClosed,
        sortedMVPLeaderboard,
        voteCounts,
    };
}
