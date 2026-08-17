import json, os, sys, time
from faster_whisper import WhisperModel

WORK = os.path.dirname(os.path.abspath(__file__))
TRANSCRIPTS = os.environ.get("TRANSCRIPTS_DIR", os.path.join(WORK, ".work", "transcripts"))
MANIFEST = os.environ.get("MANIFEST", os.path.join(WORK, ".work", "chapters.json"))
FORCE = "--force" in sys.argv
ONLY = os.path.join(WORK, ".work", "testset.json") if os.path.exists(os.path.join(WORK, ".work", "testset.json")) else None

chapters = json.load(open(ONLY or MANIFEST, encoding="utf-8"))
os.makedirs(TRANSCRIPTS, exist_ok=True)
model = WhisperModel("medium", device="cuda", compute_type="int8_float16")

t0 = time.time()
done = skipped = failed = 0
for ch in chapters:
    out = os.path.join(TRANSCRIPTS, f"{ch['book']}-{ch['chapter']}.json")
    if not FORCE and os.path.exists(out):
        skipped += 1
        continue
    try:
        segs, info = model.transcribe(ch["file"], language="he", word_timestamps=True, vad_filter=False)
        words = [{"word": w.word, "start": w.start, "end": w.end} for seg in segs for w in seg.words]
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"segments_info": str(info), "n_words": len(words), "words": words}, f, ensure_ascii=False, indent=1)
        done += 1
    except Exception as e:
        failed += 1
        print(f"FAIL {ch['book']}-{ch['chapter']}: {e!r}", flush=True)
    print(f"{ch['book']}-{ch['chapter']}: done={done} skipped={skipped} failed={failed} elapsed={(time.time()-t0)/60:.1f}m", flush=True)

print(f"FINISHED done={done} skipped={skipped} failed={failed} elapsed={(time.time()-t0)/60:.1f}m")
