import fs from "fs";
import path from "path";
import { parse as parseCSV } from "csv-parse/sync";

/**
 * Detect file format from path or content
 */
function detectFormat(filePath, content) {
  if (filePath?.endsWith(".json")) return "json";
  if (filePath?.endsWith(".csv")) return "csv";
  if (filePath?.endsWith(".txt")) return "txt";
  if (content.trim().startsWith("[")) return "json";
  if (content.includes(",")) return "csv";
  return "txt";
}

/**
 * Normalize proxy string/object into standard format string
 * Example outputs:
 *   - 1.1.1.1:8080
 *   - user:pass@1.1.1.1:8080
 */
export function normalizeProxy(p) {
  if (!p) return null;

  if (typeof p === "string") {
    return p
      .replace(/^(https?|socks[45]):\/\//i, "") // remove protocol
      .trim();
  }

  if (p.host && p.port) {
    let base = `${p.host}:${p.port}`;
    if (p.username && p.password) base = `${p.username}:${p.password}@${base}`;
    return base;
  }

  return null;
}

/**
 * Parse proxies from file, stdin, or direct args
 * Supports: .txt, .json, .csv, stdin, or inline array
 */
export async function parseProxies(input) {
  if (Array.isArray(input)) {
    return input.map(normalizeProxy).filter(Boolean);
  }

  if (!input) {
    try {
      const stdin = fs.readFileSync(0, "utf8").trim();
      if (stdin) {
        const lines = stdin.split(/\r?\n/).filter(Boolean);
        return lines.map(normalizeProxy);
      }
    } catch {
      throw new Error("No input found (file or stdin).");
    }
  }

  const absPath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(absPath)) throw new Error(`File not found: ${input}`);
  const content = fs.readFileSync(absPath, "utf8").trim();
  if (!content) throw new Error(`Empty file: ${input}`);

  const format = detectFormat(input, content);

  if (format === "json") {
    try {
      const json = JSON.parse(content);
      if (Array.isArray(json)) return json.map(normalizeProxy).filter(Boolean);
      if (Array.isArray(json.proxies)) return json.proxies.map(normalizeProxy).filter(Boolean);
      throw new Error("Invalid JSON proxy format");
    } catch (err) {
      throw new Error(`Failed to parse JSON: ${err.message}`);
    }
  }

  if (format === "csv") {
    try {
      const records = parseCSV(content, { columns: true, skip_empty_lines: true });
      return records.map(normalizeProxy).filter(Boolean);
    } catch (err) {
      throw new Error(`Failed to parse CSV: ${err.message}`);
    }
  }

  const lines = content.split(/\r?\n/).filter(Boolean);
  return lines.map(normalizeProxy);
}

/**
 * Format proxies to different output styles
 * @param {Array} proxies - list of proxy objects
 * @param {String} format - json | txt | yaml
 * @param {Boolean} simple - only output ip:port or user:pass@ip:port
 */
export function formatOutput(proxies, format = "json", simple = false) {
  if (!Array.isArray(proxies)) throw new Error("Invalid proxy data (not array)");

  if (simple) {
    const lines = proxies.map(p => {
      if (typeof p === "string") return p;
      const auth = p.proxy?.hasAuth
        ? `${p.proxy.username}:${p.proxy.password}@`
        : "";
      return `${auth}${p.proxy?.host}:${p.proxy?.port}`;
    });
    if (format === "json") return JSON.stringify(lines, null, 2);
    if (format === "yaml") return lines.join("\n");
    if (format === "txt") return lines.join("\n");
    return lines.join("\n");
  }

  if (format === "json") return JSON.stringify(proxies, null, 2);
  if (format === "yaml") {
    const yaml = proxies
      .map(p =>
        [
          `- host: ${p.proxy.host}`,
          `  port: ${p.proxy.port}`,
          `  status: ${p.status}`,
          `  country: ${p.country}`,
          `  isp: ${p.isp}`,
          `  responseTime: ${p.responseTime}`,
        ].join("\n")
      )
      .join("\n");
    return yaml;
  }

  if (format === "txt") {
    return proxies
      .map(p => `${p.proxy.host}:${p.proxy.port} (${p.country}, ${p.responseTime})`)
      .join("\n");
  }

  throw new Error(`Unsupported format: ${format}`);
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
