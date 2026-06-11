const fs = require('fs');
const path = require('path');

const { validateInput, VALID_ENUMS } = require('../code/input-validator.cjs');
const { selectPacks } = require('../code/pack-selector.cjs');
const { runHardChecks } = require('../code/hard-quality-checks.cjs');
const { combineVerdict } = require('../code/verdict-combiner.cjs');
const { formatFinalOutput, buildLyricsText } = require('../code/output-formatter.cjs');

function prompt(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'prompts', name), 'utf8');
}

const prompts = {
    intake: prompt('01-intake-interpreter.md'),
    brief: prompt('02-creative-brief.md'),
    style: prompt('03-style-prompt-composer.md'),
    lyrics: prompt('04-lyric-writer.md'),
    judge: prompt('05-soft-quality-judge.md'),
    rewrite: prompt('06-rewrite-agent.md'),
};

module.exports = {
    validateInput,
    VALID_ENUMS,
    selectPacks,
    runHardChecks,
    combineVerdict,
    formatFinalOutput,
    buildLyricsText,
    prompts,
};
