//! Minimal RFC-4180 CSV reader (quoted fields, escaped quotes, CRLF, BOM). No external dependency.
pub fn parse(input: &str) -> Vec<Vec<String>> {
    let input = input.strip_prefix('\u{feff}').unwrap_or(input);
    let (mut rows, mut row, mut field) = (vec![], vec![], String::new());
    let (mut quoted, mut chars) = (false, input.chars().peekable());
    while let Some(c) = chars.next() {
        if quoted {
            if c == '"' {
                if chars.peek() == Some(&'"') { field.push('"'); chars.next(); } else { quoted = false; }
            } else { field.push(c); }
        } else {
            match c {
                '"' if field.is_empty() => quoted = true,
                ',' => { row.push(std::mem::take(&mut field)); }
                '\r' => {}
                '\n' => { row.push(std::mem::take(&mut field)); rows.push(std::mem::take(&mut row)); }
                _ => field.push(c),
            }
        }
    }
    if !field.is_empty() || !row.is_empty() { row.push(field); rows.push(row); }
    rows.into_iter().filter(|r| !(r.len() == 1 && r[0].trim().is_empty())).collect()
}

#[cfg(test)]
mod tests {
    use super::parse;
    #[test]
    fn handles_quotes_crlf_bom_and_blank_lines() {
        let r = parse("\u{feff}a,b\r\n\"x, y\",\"he said \"\"hi\"\"\"\r\n\r\nlast,");
        assert_eq!(r, vec![vec!["a", "b"], vec!["x, y", "he said \"hi\""], vec!["last", ""]]);
    }
}
