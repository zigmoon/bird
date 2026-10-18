#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
cargo test
cargo build --release -p bird-cli
