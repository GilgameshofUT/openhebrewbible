# Word timestamps from Project 929 recordings

Derives per-word timestamps (karaoke data) from a local copy of a Project 929
chapter recording, by aligning the OSHB text against a faster-whisper
transcript. Only timestamps are stored — never audio.

## Workflow

```bash
# 1. Transcribe the chapter with word timestamps (GPU env, see below).
python transcribe.py "/media/Barracuda/Shared Files/Tanakh Audio/.../עומר פרנקל מקריא את בראשית פרק א.mp3" \
  gen1-transcript.json

# 2. Align the OSHB text to the transcript.
node map.mjs --book gen --chapter 1 \
  --transcript gen1-transcript.json --out gen-1-aligned.json

# 3. Commit the timestamps as a data/external/word-alignment/<book>-<chapter>.json
#    file, one {id,start,end} entry per word, ids matching the OSHB corpus.
```

`map.mjs` reads the unpointed book text from `data/generated/books/` and the
whisper JSON from `--transcript`. It:

1. Drops the spoken intro ("…פרק א") by finding the transcript split that
   minimises edit distance against the chapter text.
2. Aligns our text to the transcript with a character-level DP, then maps each
   word to a time range by interpolating across transcript characters (so
   merged transcript tokens yield smooth sub-word boundaries instead of snaps).
3. Enforces monotonicity as a safety net.

Sanity invariants it prints: `non-monotonic transitions: 0` and the first/last
word timings. The Genesis 1 pilot: 434 words, first word 2.578 s, last word
ends 287.92 s.

## GPU environment (conda env `align`)

The env needs CUDA libraries on the loader path for faster-whisper on a GTX
1660 SUPER:

```bash
export LD_LIBRARY_PATH="$HOME/anaconda3/envs/align/lib/python3.10/site-packages/nvidia/cublas/lib:$HOME/anaconda3/envs/align/lib/python3.10/site-packages/nvidia/cudnn/lib"
```
