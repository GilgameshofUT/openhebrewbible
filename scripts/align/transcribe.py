import sys, json
from faster_whisper import WhisperModel

audio = sys.argv[1]
out_path = sys.argv[2] if len(sys.argv) > 2 else "out_medium.json"
model_size = sys.argv[3] if len(sys.argv) > 3 else "medium"

model = WhisperModel(model_size, device="cuda", compute_type="int8_float16")

segments, info = model.transcribe(
    audio,
    language="he",
    word_timestamps=True,
    vad_filter=False,
)

out = []
for seg in segments:
    for w in seg.words:
        out.append({"word": w.word, "start": w.start, "end": w.end})

with open(out_path, "w", encoding="utf-8") as f:
    json.dump({"segments_info": str(info), "n_words": len(out), "words": out}, f, ensure_ascii=False, indent=1)

print(json.dumps({"segments_info": str(info), "n_words": len(out)}, ensure_ascii=False))
