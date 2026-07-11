#[cfg(target_os = "windows")]
use crate::config::STEAM_LIBRARY_FALLBACK_CANDIDATES;
use crate::services::path::normalize_requested_game_path;
use crate::services::paths;
use crate::services::startup::InstallerContextState;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GamePathSource {
    Detection,
    Session,
    Fallback,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GamePathResolution {
    pub game_path: PathBuf,
    /// Present iff probed present at resolution time. Always `None` under
    /// `DetectionPick`, where the database is never probed.
    pub database_path: Option<PathBuf>,
    pub source: GamePathSource,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GamePathAcceptance {
    /// Return the first detection pick without gating it or walking the
    /// session/database fallback tail.
    DetectionPick,
    /// Accept any picked directory and attach its database path iff present.
    Any,
    /// Accept only a directory whose BazaarPlusPlus database exists.
    DatabaseExists,
}

/// Resolve the game directory through the shared acceptance-parameterized
/// ladder.
pub fn resolve_game_path(
    app: &tauri::AppHandle,
    requested_game_path: Option<String>,
    session_game_path: Option<PathBuf>,
    acceptance: GamePathAcceptance,
) -> Option<GamePathResolution> {
    let startup = app.state::<InstallerContextState>().get_or_initialize(app);
    let out = resolve_game_path_core(
        GamePathInputs {
            requested: normalize_requested_game_path(requested_game_path),
            startup: startup.game_path.clone(),
            session: session_game_path,
        },
        acceptance,
        fallback_game_candidates,
        fs_probe,
    );
    crate::services::debug_log!(
        "[resolve_game_path] acceptance={:?} -> game_path={:?} source={:?} db={}",
        acceptance,
        out.as_ref()
            .map(|resolution| resolution.game_path.display().to_string()),
        out.as_ref().map(|resolution| &resolution.source),
        out.as_ref()
            .map(|resolution| resolution.database_path.is_some())
            .unwrap_or(false),
    );
    out
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GamePathProbe {
    GameInstalled,
    DatabaseFile,
}

struct GamePathInputs {
    requested: Option<PathBuf>,
    startup: Option<PathBuf>,
    session: Option<PathBuf>,
}

fn resolve_game_path_core(
    inputs: GamePathInputs,
    acceptance: GamePathAcceptance,
    candidates: impl Fn() -> Vec<PathBuf>,
    probe: impl Fn(GamePathProbe, &Path) -> bool,
) -> Option<GamePathResolution> {
    let mut memo: Option<Vec<PathBuf>> = None;

    // Requested and startup are deliberately not probed in this rung. A
    // requested pick also deliberately consumes startup even if a later
    // DatabaseExists gate rejects it (the historical masking behavior).
    let pick = inputs.requested.or(inputs.startup).or_else(|| {
        memo.get_or_insert_with(&candidates)
            .iter()
            .find(|path| probe(GamePathProbe::GameInstalled, path))
            .cloned()
    });

    if let Some(game_path) = pick {
        match acceptance {
            GamePathAcceptance::DetectionPick => {
                return Some(GamePathResolution {
                    game_path,
                    database_path: None,
                    source: GamePathSource::Detection,
                });
            }
            GamePathAcceptance::Any => {
                return Some(with_probed_db(game_path, GamePathSource::Detection, &probe));
            }
            GamePathAcceptance::DatabaseExists => {
                if probe(GamePathProbe::DatabaseFile, &game_path) {
                    return Some(GamePathResolution {
                        database_path: Some(paths::database_path(&game_path)),
                        game_path,
                        source: GamePathSource::Detection,
                    });
                }
            }
        }
    }

    if acceptance == GamePathAcceptance::DetectionPick {
        return None;
    }

    if let Some(game_path) = inputs.session {
        match acceptance {
            GamePathAcceptance::Any => {
                return Some(with_probed_db(game_path, GamePathSource::Session, &probe));
            }
            GamePathAcceptance::DatabaseExists => {
                if probe(GamePathProbe::DatabaseFile, &game_path) {
                    return Some(GamePathResolution {
                        database_path: Some(paths::database_path(&game_path)),
                        game_path,
                        source: GamePathSource::Session,
                    });
                }
            }
            GamePathAcceptance::DetectionPick => unreachable!(),
        }
    }

    memo.get_or_insert_with(&candidates)
        .iter()
        .find(|path| probe(GamePathProbe::DatabaseFile, path))
        .map(|path| GamePathResolution {
            game_path: path.clone(),
            database_path: Some(paths::database_path(path)),
            source: GamePathSource::Fallback,
        })
}

fn with_probed_db(
    game_path: PathBuf,
    source: GamePathSource,
    probe: &impl Fn(GamePathProbe, &Path) -> bool,
) -> GamePathResolution {
    let database_path =
        probe(GamePathProbe::DatabaseFile, &game_path).then(|| paths::database_path(&game_path));
    GamePathResolution {
        game_path,
        database_path,
        source,
    }
}

fn fs_probe(probe: GamePathProbe, path: &Path) -> bool {
    match probe {
        GamePathProbe::GameInstalled => crate::services::detect::is_valid_game_path(path),
        GamePathProbe::DatabaseFile => paths::database_path(path).exists(),
    }
}

pub(crate) fn find_fallback_game_path_with_database() -> Option<PathBuf> {
    fallback_game_candidates()
        .into_iter()
        .find(|path| fs_probe(GamePathProbe::DatabaseFile, path))
}

#[cfg(target_os = "windows")]
pub(crate) fn find_existing_fallback_game_path() -> Option<PathBuf> {
    let candidates = fallback_game_candidates();
    crate::services::debug_log!(
        "[detect::steam] probing common Windows candidates count={}",
        candidates.len()
    );
    candidates.into_iter().find(|path| path.exists())
}

pub(crate) fn fallback_game_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "macos")]
    {
        if let Some(path) = dirs::home_dir()
            .map(|home| home.join("Library/Application Support/Steam/steamapps/common/The Bazaar"))
        {
            push_unique(&mut candidates, path);
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Storage::FileSystem::GetLogicalDrives;

        // Only probe drive letters that actually exist. The previous
        // unconditional C..=Z scan issued ~48 `stat`s, and probing a
        // disconnected/removable drive can stall for seconds on Windows.
        let present = present_drive_letters(unsafe { GetLogicalDrives() });
        for drive in present.into_iter().filter(|letter| *letter >= 'C') {
            for root in ["Steam", "SteamLibrary"] {
                push_unique(
                    &mut candidates,
                    PathBuf::from(format!("{drive}:\\{root}\\steamapps\\common\\The Bazaar")),
                );
            }
        }

        for candidate in STEAM_LIBRARY_FALLBACK_CANDIDATES {
            push_unique(&mut candidates, PathBuf::from(candidate));
        }
    }

    candidates
}

fn push_unique(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}

/// Parse the bitmask returned by `GetLogicalDrives` (bit 0 = `A:`, ...,
/// bit 25 = `Z:`) into the drive letters that currently exist. Kept pure so
/// the bit math is unit-testable without the Win32 call.
#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
fn present_drive_letters(bitmask: u32) -> Vec<char> {
    ('A'..='Z')
        .enumerate()
        .filter(|(index, _)| bitmask & (1 << index) != 0)
        .map(|(_, letter)| letter)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::present_drive_letters;

    #[test]
    fn present_drive_letters_parses_c_and_d() {
        // bit2 (C:) + bit3 (D:)
        assert_eq!(present_drive_letters(0b1100), vec!['C', 'D']);
    }

    #[test]
    fn present_drive_letters_is_empty_when_no_bits_set() {
        assert!(present_drive_letters(0).is_empty());
    }

    #[test]
    fn present_drive_letters_parses_a_and_z_extremes() {
        // bit0 (A:) + bit25 (Z:) guards the enumerate/shift bounds.
        assert_eq!(present_drive_letters(0b1 | (1 << 25)), vec!['A', 'Z']);
    }
}

#[cfg(test)]
mod resolve_tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashSet;

    fn p(value: &str) -> PathBuf {
        PathBuf::from(value)
    }

    struct Row {
        name: &'static str,
        requested: Option<&'static str>,
        startup: Option<&'static str>,
        session: Option<&'static str>,
        fallback: &'static [&'static str],
        game_installed: &'static [&'static str],
        has_db: &'static [&'static str],
        acceptance: GamePathAcceptance,
        expect: Option<(&'static str, GamePathSource, bool)>,
        expect_probe_log: &'static [&'static str],
        expect_candidate_calls: usize,
    }

    fn run(row: &Row) {
        let game: HashSet<PathBuf> = row.game_installed.iter().map(|value| p(value)).collect();
        let db: HashSet<PathBuf> = row.has_db.iter().map(|value| p(value)).collect();
        let log = RefCell::new(Vec::new());
        let candidate_calls = RefCell::new(0usize);
        let candidates = || {
            *candidate_calls.borrow_mut() += 1;
            row.fallback.iter().map(|value| p(value)).collect()
        };
        let probe = |kind: GamePathProbe, path: &Path| match kind {
            GamePathProbe::GameInstalled => {
                log.borrow_mut().push(format!("exe:{}", path.display()));
                game.contains(path)
            }
            GamePathProbe::DatabaseFile => {
                log.borrow_mut().push(format!("db:{}", path.display()));
                db.contains(path)
            }
        };

        let got = resolve_game_path_core(
            GamePathInputs {
                requested: row.requested.map(p),
                startup: row.startup.map(p),
                session: row.session.map(p),
            },
            row.acceptance,
            candidates,
            probe,
        );

        match &row.expect {
            None => assert!(got.is_none(), "{}", row.name),
            Some((path, source, database_attached)) => {
                let resolution = got.expect(row.name);
                assert_eq!(resolution.game_path, p(path), "{}", row.name);
                assert_eq!(&resolution.source, source, "{}", row.name);
                assert_eq!(
                    resolution.database_path.is_some(),
                    *database_attached,
                    "{}: database attachment",
                    row.name
                );
            }
        }
        assert_eq!(
            *candidate_calls.borrow(),
            row.expect_candidate_calls,
            "{}: candidate list laziness",
            row.name
        );
        assert!(
            *candidate_calls.borrow() <= 1,
            "{}: candidates built more than once",
            row.name
        );
        assert_eq!(
            *log.borrow(),
            row.expect_probe_log
                .iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>(),
            "{}: probe order",
            row.name
        );
    }

    const ROWS: &[Row] = &[
        Row {
            name: "requested is verbatim and unprobed",
            requested: Some("/r"),
            startup: Some("/s"),
            session: None,
            fallback: &["/f"],
            game_installed: &["/s", "/f"],
            has_db: &[],
            acceptance: GamePathAcceptance::DetectionPick,
            expect: Some(("/r", GamePathSource::Detection, false)),
            expect_probe_log: &[],
            expect_candidate_calls: 0,
        },
        Row {
            name: "startup beats fallback without probing",
            requested: None,
            startup: Some("/s"),
            session: None,
            fallback: &["/f"],
            game_installed: &["/f"],
            has_db: &[],
            acceptance: GamePathAcceptance::DetectionPick,
            expect: Some(("/s", GamePathSource::Detection, false)),
            expect_probe_log: &[],
            expect_candidate_calls: 0,
        },
        Row {
            name: "detection fallback scan stops at second hit",
            requested: None,
            startup: None,
            session: None,
            fallback: &["/f1", "/f2"],
            game_installed: &["/f2"],
            has_db: &[],
            acceptance: GamePathAcceptance::DetectionPick,
            expect: Some(("/f2", GamePathSource::Detection, false)),
            expect_probe_log: &["exe:/f1", "exe:/f2"],
            expect_candidate_calls: 1,
        },
        Row {
            name: "detection fallback scan stops at first hit",
            requested: None,
            startup: None,
            session: None,
            fallback: &["/f1", "/f2"],
            game_installed: &["/f1", "/f2"],
            has_db: &[],
            acceptance: GamePathAcceptance::DetectionPick,
            expect: Some(("/f1", GamePathSource::Detection, false)),
            expect_probe_log: &["exe:/f1"],
            expect_candidate_calls: 1,
        },
        Row {
            name: "detection suppresses database-only tail",
            requested: None,
            startup: None,
            session: None,
            fallback: &["/f1"],
            game_installed: &[],
            has_db: &["/f1"],
            acceptance: GamePathAcceptance::DetectionPick,
            expect: None,
            expect_probe_log: &["exe:/f1"],
            expect_candidate_calls: 1,
        },
        Row {
            name: "any accepts database-less detection pick",
            requested: Some("/r"),
            startup: None,
            session: None,
            fallback: &[],
            game_installed: &[],
            has_db: &[],
            acceptance: GamePathAcceptance::Any,
            expect: Some(("/r", GamePathSource::Detection, false)),
            expect_probe_log: &["db:/r"],
            expect_candidate_calls: 0,
        },
        Row {
            name: "any attaches database to detection pick",
            requested: Some("/r"),
            startup: None,
            session: None,
            fallback: &[],
            game_installed: &[],
            has_db: &["/r"],
            acceptance: GamePathAcceptance::Any,
            expect: Some(("/r", GamePathSource::Detection, true)),
            expect_probe_log: &["db:/r"],
            expect_candidate_calls: 0,
        },
        Row {
            name: "any session beats database fallback without gate",
            requested: None,
            startup: None,
            session: Some("/sess"),
            fallback: &["/f1"],
            game_installed: &[],
            has_db: &["/f1"],
            acceptance: GamePathAcceptance::Any,
            expect: Some(("/sess", GamePathSource::Session, false)),
            expect_probe_log: &["exe:/f1", "db:/sess"],
            expect_candidate_calls: 1,
        },
        Row {
            name: "any reuses candidates for database fallback tail",
            requested: None,
            startup: None,
            session: None,
            fallback: &["/f1", "/f2"],
            game_installed: &[],
            has_db: &["/f2"],
            acceptance: GamePathAcceptance::Any,
            expect: Some(("/f2", GamePathSource::Fallback, true)),
            expect_probe_log: &["exe:/f1", "exe:/f2", "db:/f1", "db:/f2"],
            expect_candidate_calls: 1,
        },
        Row {
            name: "database gate accepts detection pick",
            requested: Some("/r"),
            startup: None,
            session: None,
            fallback: &["/f"],
            game_installed: &[],
            has_db: &["/r"],
            acceptance: GamePathAcceptance::DatabaseExists,
            expect: Some(("/r", GamePathSource::Detection, true)),
            expect_probe_log: &["db:/r"],
            expect_candidate_calls: 0,
        },
        Row {
            name: "database gate preserves requested masking",
            requested: Some("/r"),
            startup: Some("/s"),
            session: None,
            fallback: &[],
            game_installed: &[],
            has_db: &["/s"],
            acceptance: GamePathAcceptance::DatabaseExists,
            expect: None,
            expect_probe_log: &["db:/r"],
            expect_candidate_calls: 1,
        },
        Row {
            name: "masked startup can win only through fallback scan",
            requested: Some("/r"),
            startup: Some("/s"),
            session: None,
            fallback: &["/s"],
            game_installed: &[],
            has_db: &["/s"],
            acceptance: GamePathAcceptance::DatabaseExists,
            expect: Some(("/s", GamePathSource::Fallback, true)),
            expect_probe_log: &["db:/r", "db:/s"],
            expect_candidate_calls: 1,
        },
        Row {
            name: "database gate permits session rescue",
            requested: Some("/r"),
            startup: None,
            session: Some("/sess"),
            fallback: &["/f"],
            game_installed: &[],
            has_db: &["/sess"],
            acceptance: GamePathAcceptance::DatabaseExists,
            expect: Some(("/sess", GamePathSource::Session, true)),
            expect_probe_log: &["db:/r", "db:/sess"],
            expect_candidate_calls: 0,
        },
        Row {
            name: "database tail preserves candidate order",
            requested: Some("/r"),
            startup: None,
            session: Some("/sess"),
            fallback: &["/f1", "/f2"],
            game_installed: &[],
            has_db: &["/f2"],
            acceptance: GamePathAcceptance::DatabaseExists,
            expect: Some(("/f2", GamePathSource::Fallback, true)),
            expect_probe_log: &["db:/r", "db:/sess", "db:/f1", "db:/f2"],
            expect_candidate_calls: 1,
        },
        Row {
            name: "database gate returns none when every rung misses",
            requested: None,
            startup: None,
            session: None,
            fallback: &["/f1"],
            game_installed: &[],
            has_db: &[],
            acceptance: GamePathAcceptance::DatabaseExists,
            expect: None,
            expect_probe_log: &["exe:/f1", "db:/f1"],
            expect_candidate_calls: 1,
        },
    ];

    #[test]
    fn ladder_order_predicates_and_io_shape() {
        for row in ROWS {
            run(row);
        }
    }

    #[test]
    fn fs_probe_maps_game_and_database_artifacts_to_their_probe_kinds() {
        let temp_root = std::env::temp_dir().join(format!(
            "bppinstaller-game-path-probe-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time before epoch")
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_root).expect("create temp game directory");

        assert!(!fs_probe(GamePathProbe::GameInstalled, &temp_root));
        assert!(!fs_probe(GamePathProbe::DatabaseFile, &temp_root));

        #[cfg(target_os = "macos")]
        std::fs::create_dir(temp_root.join("TheBazaar.app")).expect("create game app marker");
        #[cfg(target_os = "windows")]
        std::fs::write(temp_root.join("TheBazaar.exe"), b"exe").expect("create game exe marker");
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        std::fs::write(temp_root.join("TheBazaar"), b"exe").expect("create game marker");

        assert!(fs_probe(GamePathProbe::GameInstalled, &temp_root));
        assert!(!fs_probe(GamePathProbe::DatabaseFile, &temp_root));

        let database_path = paths::database_path(&temp_root);
        std::fs::create_dir_all(database_path.parent().expect("database parent"))
            .expect("create database directory");
        std::fs::write(&database_path, b"sqlite").expect("create database marker");
        assert!(fs_probe(GamePathProbe::DatabaseFile, &temp_root));

        std::fs::remove_dir_all(&temp_root).expect("cleanup temp game directory");
    }
}
