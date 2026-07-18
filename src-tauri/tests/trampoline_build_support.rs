#[path = "../build_support.rs"]
mod build_support;

use std::time::{Duration, SystemTime};

#[test]
fn missing_trampoline_requires_compilation() {
    let source_modified = SystemTime::UNIX_EPOCH + Duration::from_secs(20);

    assert!(build_support::should_compile_trampoline(
        source_modified,
        None
    ));
}

#[test]
fn newer_trampoline_source_requires_compilation() {
    let output_modified = SystemTime::UNIX_EPOCH + Duration::from_secs(20);
    let source_modified = output_modified + Duration::from_secs(1);

    assert!(build_support::should_compile_trampoline(
        source_modified,
        Some(output_modified)
    ));
}

#[test]
fn fresh_trampoline_output_is_reused() {
    let source_modified = SystemTime::UNIX_EPOCH + Duration::from_secs(20);
    let output_modified = source_modified + Duration::from_secs(1);

    assert!(!build_support::should_compile_trampoline(
        source_modified,
        Some(output_modified)
    ));
}
