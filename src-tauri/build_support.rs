use std::time::SystemTime;

pub fn should_compile_trampoline(
    source_modified: SystemTime,
    output_modified: Option<SystemTime>,
) -> bool {
    match output_modified {
        Some(output_modified) => source_modified > output_modified,
        None => true,
    }
}
