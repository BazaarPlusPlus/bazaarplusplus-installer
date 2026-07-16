use std::path::Path;
use std::process::Command;
use std::time::SystemTime;

fn main() {
    compile_macos_trampoline_stub();
    tauri_build::build()
}

/// Compile the macOS launch trampoline stub (arm64) from its committed C source so
/// the bundled resource declared in `tauri.macos.conf.json` exists before
/// `tauri_build` validates resource paths. Runs on every macOS cargo build (dev,
/// `npm run check`, bindings, release) when the source is newer or the output is
/// missing. The compiled binary is gitignored. No-op when not targeting macOS.
fn compile_macos_trampoline_stub() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }

    let source = "resources/SourceForBuild/macos/bpp_launcher.c";
    let output = "resources/Trampoline/macos/bpp_launcher";
    // Do not watch the generated output: Tauri watches resources in dev mode, and
    // rewriting it on every Cargo invocation would trigger an endless rebuild loop.
    println!("cargo:rerun-if-changed={source}");

    if trampoline_stub_is_current(source, output) {
        return;
    }

    if let Some(parent) = Path::new(output).parent() {
        std::fs::create_dir_all(parent)
            .unwrap_or_else(|err| panic!("cannot create {}: {err}", parent.display()));
    }

    let status = Command::new("clang")
        .args(["-arch", "arm64", "-O2", "-o", output, source])
        .status()
        .unwrap_or_else(|err| panic!("failed to run clang for trampoline stub: {err}"));
    if !status.success() {
        panic!("clang failed to compile the macOS trampoline stub ({source})");
    }
}

fn trampoline_stub_is_current(source: &str, output: &str) -> bool {
    let source_modified = std::fs::metadata(source)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let output_modified = std::fs::metadata(output).and_then(|metadata| metadata.modified());

    matches!(output_modified, Ok(modified) if modified >= source_modified)
}
