//! Shared validation rules (contract C15).
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

pub struct FieldError {
    pub field: &'static str,
    pub code: &'static str,
    pub message: String,
}
type R = Result<(), FieldError>;
fn fe(field: &'static str, code: &'static str, m: &str) -> R { Err(FieldError { field, code, message: m.to_string() }) }

pub fn username(s: &str) -> R {
    if (3..=32).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b)) { Ok(()) }
    else { fe("username", "INVALID_FORMAT", "3-32 chars of a-z 0-9 . _ -") }
}

const COMMON: &[&str] = &["password123", "1234567890", "qwerty12345", "password1234", "admin12345", "letmein1234", "iloveyou123"];
pub fn password(s: &str) -> R {
    if s.chars().count() < 10 { return fe("password", "TOO_SHORT", "At least 10 characters"); }
    if !s.chars().any(|c| c.is_alphabetic()) || !s.chars().any(|c| c.is_ascii_digit()) { return fe("password", "WEAK", "Must contain a letter and a digit"); }
    if COMMON.contains(&s.to_lowercase().as_str()) { return fe("password", "COMMON", "Password is too common"); }
    Ok(())
}

pub fn phone_bd(s: &str) -> R {
    let d = s.strip_prefix("+88").unwrap_or(s);
    if d.len() == 11 && d.starts_with("01") && d.bytes().all(|b| b.is_ascii_digit()) { Ok(()) } else { fe("phone", "INVALID_FORMAT", "Use 01XXXXXXXXX or +8801XXXXXXXXX") }
}

pub fn student_code(s: &str) -> R {
    if (4..=20).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'-') { Ok(()) } else { fe("studentCode", "INVALID_FORMAT", "4-20 chars of A-Z 0-9 -") }
}

pub fn email(s: &str) -> R {
    let ok = s.len() <= 254 && s.split_once('@').map(|(l, d)| !l.is_empty() && d.contains('.') && !d.starts_with('.') && !d.ends_with('.') && !s.contains(' ')).unwrap_or(false);
    if ok { Ok(()) } else { fe("email", "INVALID_FORMAT", "Invalid email") }
}

pub fn text(field: &'static str, s: &str, min: usize, max: usize) -> R {
    let n = s.trim().chars().count();
    if n < min || n > max { return fe(field, "OUT_OF_RANGE", &format!("Length must be {min}-{max}")); }
    if s.chars().any(|c| c.is_control() && c != '\n' && c != '\t' && c != '\r') { return fe(field, "INVALID_CHARACTERS", "Control characters not allowed"); }
    Ok(())
}

pub fn marks(m: Option<Decimal>, absent: bool, full: Decimal) -> R {
    match (m, absent) {
        (Some(_), true) => fe("marksObtained", "ABSENT_HAS_MARKS", "Absent students must have no marks"),
        (None, false) => fe("marksObtained", "REQUIRED", "Marks required unless absent"),
        (None, true) => Ok(()),
        (Some(v), false) => {
            if v < dec!(0) || v > full { fe("marksObtained", "OUT_OF_RANGE", &format!("Must be between 0 and {full}")) }
            else if v.scale() > 2 && v.normalize().scale() > 2 { fe("marksObtained", "TOO_MANY_DECIMALS", "At most 2 decimals") }
            else { Ok(()) }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn usernames() { assert!(username("teacher.rahim").is_ok()); assert!(username("Ab").is_err()); assert!(username("a b c").is_err()); }
    #[test] fn passwords() { assert!(password("short1").is_err()); assert!(password("longpasswordonly").is_err()); assert!(password("Tr1cky-Horse9").is_ok()); assert!(password("Password123").is_err()); }
    #[test] fn phones() { assert!(phone_bd("01712345678").is_ok()); assert!(phone_bd("+8801712345678").is_ok()); assert!(phone_bd("0271234567").is_err()); }
    #[test] fn codes() { assert!(student_code("S-2026-001").is_ok()); assert!(student_code("abc").is_err()); }
    #[test] fn emails() { assert!(email("a@b.com").is_ok()); assert!(email("a@b").is_err()); }
    #[test] fn texts() { assert!(text("t", "  ", 1, 5).is_err()); assert!(text("t", "ok", 1, 5).is_ok()); assert!(text("t", "toolong", 1, 5).is_err()); }
    #[test] fn marks_rules() {
        let f = dec!(100);
        assert!(marks(Some(dec!(100)), false, f).is_ok());
        assert!(marks(Some(dec!(100.01)), false, f).is_err());
        assert!(marks(Some(dec!(-1)), false, f).is_err());
        assert!(marks(Some(dec!(50.123)), false, f).is_err());
        assert!(marks(Some(dec!(50.12)), false, f).is_ok());
        assert!(marks(None, true, f).is_ok());
        assert!(marks(None, false, f).is_err());
        assert!(marks(Some(dec!(1)), true, f).is_err());
    }
}
