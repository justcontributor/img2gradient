function getInterpColor(t, a, b) {
    if (a.t === b.t) return { ...a };
    const ratio = (t - a.t) / (b.t - a.t);
    return {
        r: a.r + (b.r - a.r) * ratio,
        g: a.g + (b.g - a.g) * ratio,
        b: a.b + (b.b - a.b) * ratio
    };
}

function getDistSq(p1, p2) {
    const dr = p1.r - p2.r;
    const dg = p1.g - p2.g;
    const db = p1.b - p2.b;
    return dr * dr + dg * dg + db * db;
}

function calculateMSE(original, simplified) {
    let error = 0;
    let sIdx = 0;

    for (let i = 0; i < original.length; i++) {
        const t = original[i].t;
        while (sIdx < simplified.length - 2 && simplified[sIdx + 1].t < t) {
            sIdx++;
        }
        const interp = getInterpColor(t, simplified[sIdx], simplified[sIdx + 1]);
        error += getDistSq(original[i], interp);
    }
    return error / original.length;
}

/**
 * Algorithm 1: Douglas-Peucker (Simple)
 * Keeps original stops, removes those that deviate less than threshold.
 */
function dpOptimize(stops, thresholdSq, start, end) {
    let maxDistSq = 0;
    let index = 0;

    for (let i = start + 1; i < end; i++) {
        const interp = getInterpColor(stops[i].t, stops[start], stops[end]);
        const distSq = getDistSq(stops[i], interp);
        if (distSq > maxDistSq) {
            index = i;
            maxDistSq = distSq;
        }
    }

    if (maxDistSq > thresholdSq) {
        const left = dpOptimize(stops, thresholdSq, start, index);
        const right = dpOptimize(stops, thresholdSq, index, end);
        return [...left.slice(0, -1), ...right];
    } else {
        return [{...stops[start]}, {...stops[end]}];
    }
}

/**
 * Algorithm 2: Greedy Iterative (Similarity)
 * Starts with endpoints and iteratively adds the stop that reduces MSE the most.
 */
function greedyOptimize(stops, threshold) {
    const thresholdSq = threshold * threshold;
    let result = [{...stops[0]}, {...stops[stops.length - 1]}];
    let usedIndices = new Set([0, stops.length - 1]);

    while (result.length < stops.length) {
        const currentMSE = calculateMSE(stops, result);
        if (currentMSE <= thresholdSq) break;

        let bestIndex = -1;
        let bestMSE = currentMSE;

        // Try adding each unused stop
        for (let i = 0; i < stops.length; i++) {
            if (usedIndices.has(i)) continue;

            // Insert i into result keeping it sorted by t
            const tempResult = [...result];
            const insertPos = tempResult.findIndex(s => s.t > stops[i].t);
            tempResult.splice(insertPos, 0, stops[i]);

            const mse = calculateMSE(stops, tempResult);
            if (mse < bestMSE) {
                bestMSE = mse;
                bestIndex = i;
            }
        }

        if (bestIndex !== -1) {
            const insertPos = result.findIndex(s => s.t > stops[bestIndex].t);
            result.splice(insertPos, 0, {...stops[bestIndex]});
            usedIndices.add(bestIndex);
        } else {
            break;
        }
    }
    return result;
}

/**
 * Algorithm 3: Adaptive Refinement (Moving Stops)
 * First uses DP/Greedy, then adjusts positions and colors slightly.
 */
function adaptiveOptimize(stops, threshold) {
    // Start with greedy optimization to get baseline points
    let currentStops = greedyOptimize(stops, threshold);
    if (currentStops.length <= 2) return currentStops;

    // Refine: For Each intermediate stop, try moving it slightly in t and color
    // This is a simplified version: only adjust position t
    for (let iter = 0; iter < 2; iter++) { // 2 passes
        for (let i = 1; i < currentStops.length - 1; i++) {
            const prev = currentStops[i - 1];
            const next = currentStops[i + 1];
            const originalI = stops.find(s => s.t === currentStops[i].t); 
            
            // Simple hill climbing for position t
            const step = (next.t - prev.t) * 0.05;
            let bestT = currentStops[i].t;
            let bestMSE = calculateMSE(stops, currentStops);

            for (let dt of [-step, step]) {
                const testT = Math.max(prev.t + 0.1, Math.min(next.t - 0.1, currentStops[i].t + dt));
                const oldT = currentStops[i].t;
                currentStops[i].t = testT;
                const mse = calculateMSE(stops, currentStops);
                if (mse < bestMSE) {
                    bestMSE = mse;
                    bestT = testT;
                } else {
                    currentStops[i].t = oldT;
                }
            }
            currentStops[i].t = bestT;
        }
    }

    return currentStops;
}

export function optimizeStops(stops, threshold, method = "simple") {
    if (!stops || stops.length <= 2 || threshold <= 0) return stops;

    const thresholdSq = threshold * threshold;

    switch (method) {
        case "greedy":
            return greedyOptimize(stops, threshold);
        case "adaptive":
            return adaptiveOptimize(stops, threshold);
        case "simple":
        default:
            return dpOptimize(stops, thresholdSq, 0, stops.length - 1);
    }
}
