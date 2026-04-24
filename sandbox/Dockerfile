FROM docker.io/cloudflare/sandbox:0.8.11

# ffmpeg powers the existing audio pipeline.
# yt-dlp + python3 added for Atomic Transcription — extracts audio from
# YouTube / Vimeo / TikTok / X / Loom URLs before dispatching to AssemblyAI.
# The base image ships pip <23 so --break-system-packages is unsupported
# and not needed; pip3 installs into /usr/local directly.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && pip3 install --no-cache-dir yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /audio
