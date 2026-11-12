//! Minimal dependency-free PDF writer (A4, built-in Helvetica). Text is Latin-1 only: other scripts are replaced with '?'.
pub struct Page {
    ops: String,
}
pub struct Pdf {
    pages: Vec<Page>,
}

fn esc(s: &str) -> String {
    let mut o = String::new();
    for c in s.chars() {
        match c {
            '\\' => o.push_str("\\\\"),
            '(' => o.push_str("\\("),
            ')' => o.push_str("\\)"),
            c if (c as u32) >= 32 && (c as u32) < 127 => o.push(c),
            c if (c as u32) >= 160 && (c as u32) < 256 => {
                o.push_str(&format!("\\{:03o}", c as u32))
            }
            _ => o.push('?'),
        }
    }
    o
}

impl Page {
    pub fn text(&mut self, x: f32, y: f32, size: f32, bold: bool, s: &str) {
        self.ops.push_str(&format!(
            "BT /{} {size} Tf {x:.1} {y:.1} Td ({}) Tj ET\n",
            if bold { "F2" } else { "F1" },
            esc(s)
        ));
    }
    pub fn line(&mut self, x1: f32, y1: f32, x2: f32, y2: f32) {
        self.ops
            .push_str(&format!("0.5 w {x1:.1} {y1:.1} m {x2:.1} {y2:.1} l S\n"));
    }
    pub fn rect(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.ops
            .push_str(&format!("0.5 w {x:.1} {y:.1} {w:.1} {h:.1} re S\n"));
    }
}

impl Default for Pdf {
    fn default() -> Self {
        Self::new()
    }
}

impl Pdf {
    pub fn new() -> Self {
        Pdf { pages: vec![] }
    }
    pub fn page(&mut self) -> &mut Page {
        self.pages.push(Page { ops: String::new() });
        self.pages.last_mut().unwrap()
    }
    pub fn finish(self) -> Vec<u8> {
        let n = self.pages.len();
        // objects: 1 catalog, 2 pages, 3 font regular, 4 font bold, then (page, content) pairs
        let mut objs: Vec<String> = vec![String::new(); 4 + 2 * n];
        objs[0] = "<< /Type /Catalog /Pages 2 0 R >>".into();
        let kids: Vec<String> = (0..n).map(|i| format!("{} 0 R", 5 + 2 * i)).collect();
        objs[1] = format!("<< /Type /Pages /Kids [{}] /Count {n} >>", kids.join(" "));
        objs[2] =
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
                .into();
        objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>".into();
        for (i, p) in self.pages.iter().enumerate() {
            objs[4 + 2 * i] = format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {} 0 R >>", 6 + 2 * i);
            objs[5 + 2 * i] = format!("<< /Length {} >>\nstream\n{}endstream", p.ops.len(), p.ops);
        }
        let mut out: Vec<u8> = b"%PDF-1.4\n".to_vec();
        let mut offs = vec![];
        for (i, o) in objs.iter().enumerate() {
            offs.push(out.len());
            out.extend(format!("{} 0 obj\n{}\nendobj\n", i + 1, o).into_bytes());
        }
        let xref = out.len();
        out.extend(format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1).into_bytes());
        for o in offs {
            out.extend(format!("{o:010} 00000 n \n").into_bytes());
        }
        out.extend(
            format!(
                "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
                objs.len() + 1
            )
            .into_bytes(),
        );
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn produces_valid_structure() {
        let mut p = Pdf::new();
        let pg = p.page();
        pg.text(50.0, 780.0, 14.0, true, "Report (Card) \\ test \u{9b2}");
        pg.line(50.0, 770.0, 545.0, 770.0);
        let b = p.finish();
        let s = String::from_utf8_lossy(&b);
        assert!(s.starts_with("%PDF-1.4") && s.trim_end().ends_with("%%EOF"));
        assert!(s.contains("/Count 1") && s.contains("Report \\(Card\\) \\\\ test ?"));
        // xref offsets point at "N 0 obj"
        let xr = s.rfind("startxref\n").unwrap();
        let off: usize = s[xr + 10..].lines().next().unwrap().parse().unwrap();
        assert!(s[off..].starts_with("xref"));
    }
}
