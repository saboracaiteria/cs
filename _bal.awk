# balanceamento de chaves/parenteses ignorando strings e comentarios
function strip(s,   out, i, ch, c2, q, esc, inblk) {
  out = "";
  inblk = 0;
  for (i = 1; i <= length(s); i++) {
    ch = substr(s, i, 1);
    if (inblk) {
      if (ch == "*" && substr(s, i+1, 1) == "/") { inblk = 0; i++; }
      continue;
    }
    if (ch == "/" && substr(s, i+1, 1) == "/") break;
    if (ch == "/" && substr(s, i+1, 1) == "*") { inblk = 1; i++; continue; }
    if (ch == "'" || ch == "\"") {
      q = ch; esc = 0; i++;
      while (i <= length(s)) {
        c2 = substr(s, i, 1);
        if (c2 == "\\" && !esc) { esc = 1; i++; continue; }
        if (c2 == q && !esc) break;
        esc = 0; i++;
      }
      continue;
    }
    out = out ch;
  }
  return out;
}
{ t = strip($0); a += gsub(/\{/, "{", t); b += gsub(/\}/, "}", t); c += gsub(/\(/, "(", t); d += gsub(/\)/, ")", t); }
END { printf "braces: %d { vs %d } (diff %d) | parens: %d ( vs %d ) (diff %d)\n", a, b, a-b, c, d, c-d; }
