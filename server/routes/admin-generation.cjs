const express = require('express');
const { getSongPipeline, RESUMABLE_STAGES } = require('../services/song-pipeline.cjs');

const router = express.Router({ mergeParams: true });

function handleError(res, err) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Generation request failed' });
}

router.get('/', async (req, res) => {
    try {
        const generation = await getSongPipeline().getGeneration(req.params.orderId);
        if (!generation) return res.status(404).json({ error: 'Generation not found' });
        res.json(generation);
    } catch (err) {
        handleError(res, err);
    }
});

router.post('/start', async (req, res) => {
    try {
        const generation = await getSongPipeline().startGeneration(req.params.orderId, {
            restart: !!req.body?.restart,
        });
        res.status(202).json(generation);
    } catch (err) {
        handleError(res, err);
    }
});

router.post('/stages/:stage/regenerate', async (req, res) => {
    try {
        if (!RESUMABLE_STAGES.includes(req.params.stage)) {
            return res.status(400).json({ error: `Stage must be one of: ${RESUMABLE_STAGES.join(', ')}` });
        }
        const generation = await getSongPipeline().regenerateFromStage(req.params.orderId, req.params.stage, {
            comment: req.body?.comment || '',
        });
        res.status(202).json(generation);
    } catch (err) {
        handleError(res, err);
    }
});

router.patch('/overrides', async (req, res) => {
    try {
        const allowed = ['tone_preference', 'relationship_energy', 'emotion_intensity'];
        const overrides = {};
        for (const field of allowed) {
            if (req.body?.[field]) overrides[field] = req.body[field];
        }
        const generation = await getSongPipeline().applyOverrides(req.params.orderId, overrides);
        res.json(generation);
    } catch (err) {
        handleError(res, err);
    }
});

module.exports = router;
