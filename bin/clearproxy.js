#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { Command } from "commander";
import fetch from "node-fetch";
import ora from "ora";
import chalk from "chalk";
import { parseProxies, formatOutput } from "../lib/utils.js";

const program = new Command();
const CONFIG_PATH = path.join(os.homedir(), ".clearproxyrc");
const API_BASE = "https://api.clearproxy.io";

// === Banner ===
function printBanner() {
  console.log(
    chalk.white(`
╭──────────────────────────────────────────────╮
│              ${chalk.gray("ClearProxy.io CLI")}               │
╰──────────────────────────────────────────────╯
`)
  );
}

// === Load Key ===
function loadKey() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log(chalk.redBright("✘ API key not found."));
    console.log(chalk.dim("→ Run ") + chalk.cyan("clearproxy set-key <your_api_key>"));
    process.exit(1);
  }
  const { apiKey } = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  return apiKey;
}

// === API Request Helper ===
async function apiRequest(endpoint, apiKey, options = {}) {
  const spinner = ora(chalk.dim("Fetching data...")).start();
  
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: options.method || "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      spinner.fail(chalk.red(`API Error: ${res.status}`));
      const text = await res.text();
      throw new Error(text);
    }

    const data = await res.json();
    spinner.succeed(chalk.white("Done."));
    return data;
  } catch (err) {
    spinner.fail(chalk.red("Request failed"));
    throw err;
  }
}

// === CLI HEADER ===
program
  .name(chalk.cyan("clearproxy"))
  .description(
    chalk.dim("The fastest proxy checker powered by ClearProxy.io API.")
  
  )
  .version("1.0.0", "-v, --version", "Show version info")
  .hook("preAction", () => printBanner());

// === COMMAND: set-key ===
program
  .command("set-key <apiKey>")
  .description(chalk.yellow("Save your ClearProxy.io API key locally"))
  .summary("Save API key")
  .addHelpText('after', `
${chalk.bold("Arguments:")}
  ${chalk.cyan("apiKey")}        ${chalk.white("Your ClearProxy.io API key")} ${chalk.red("[required]")}

${chalk.bold("Description:")}
  Saves your API key to ${chalk.dim(CONFIG_PATH)}
  This key will be used for all subsequent API requests.

${chalk.bold("Example:")}
  ${chalk.cyan("$ clearproxy set-key")} ${chalk.dim("sk_1234567890abcdef")}
  ${chalk.green("✓")} API key saved successfully!
`)
  .action(apiKey => {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ apiKey }, null, 2));
    console.log(
      chalk.greenBright("API key saved successfully!") +
        "\n" +
        chalk.dim(`Saved to: ${CONFIG_PATH}`)
    );
  });

// === COMMAND: me ===
program
  .command("me")
  .description(chalk.yellow("Get your account information and quota"))
  .summary("View account info")
  .option("--debug", "Show raw API response", false)
  .option("--history", "Show recent check history", false)
  .option("--usage", "Show usage chart for last 30 days", false)
  .addHelpText('after', `
${chalk.bold("Options:")}
  ${chalk.cyan("--debug")}       ${chalk.white("Show raw JSON response from API")} ${chalk.dim("[optional]")}
  ${chalk.cyan("--history")}     ${chalk.white("Display last 10 proxy checks")} ${chalk.dim("[optional]")}
  ${chalk.cyan("--usage")}       ${chalk.white("Show 7-day usage chart")} ${chalk.dim("[optional]")}

${chalk.bold("Description:")}
  Displays your account details including:
  • User ID and email
  • Remaining checks quota
  • Recent check history (with --history)
  • Usage statistics for last 30 days (with --usage)

${chalk.bold("Examples:")}
  ${chalk.cyan("$ clearproxy me")}
  ${chalk.dim("User ID       : usr_abc123")}
  ${chalk.dim("Email         : user@example.com")}
  ${chalk.dim("Checks Left   : 9,847")}

  ${chalk.cyan("$ clearproxy me --history")}
  ${chalk.dim("Shows recent proxy check history")}

  ${chalk.cyan("$ clearproxy me --usage")}
  ${chalk.dim("Displays usage bar chart for last 7 days")}

  ${chalk.cyan("$ clearproxy me --debug")}
  ${chalk.dim("Shows raw JSON response")}
`)
  .action(async (options) => {
    try {
      const apiKey = loadKey();
      const data = await apiRequest("/me", apiKey);

      if (options.debug) {
        console.log(chalk.yellow("\n──── RAW API RESPONSE ────"));
        console.log(JSON.stringify(data, null, 2));
        console.log("");
        return;
      }

      const user = data.user || {};
      const userId = user.id || "N/A";
      const email = user.email || "N/A";
      const checks = user.checks || 0;

      console.log(chalk.bold.gray("\n──── ACCOUNT INFO ────"));
      console.log(`${chalk.dim("[*]")} User ID       : ${chalk.white(userId)}`);
      console.log(`${chalk.dim("[*]")} Email         : ${chalk.white(email)}`);
      console.log(`${chalk.dim("[+]")} Checks Left  : ${chalk.green(checks.toLocaleString())}`);
      

      // Show usage chart if requested
      if (options.usage && data.usage_last_30_days) {
        console.log(chalk.bold.gray("\n──── USAGE LAST 30 DAYS ────"));
        const usage = data.usage_last_30_days;
        const maxChecks = Math.max(...usage.map(u => u.total_checked));
        const barWidth = 40;
        
        usage.slice(-7).forEach(day => {
          const date = new Date(day.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const checks = day.total_checked;
          const barLength = maxChecks > 0 ? Math.round((checks / maxChecks) * barWidth) : 0;
          const bar = checks > 0 ? chalk.cyan("█".repeat(barLength)) : chalk.dim("·");
          console.log(`${chalk.dim(date.padEnd(8))} ${bar} ${chalk.white(checks.toLocaleString())}`);
        });
      }

      // Show recent history if requested
      if (options.history && data.history) {
        console.log(chalk.bold.gray("\n──── RECENT CHECK HISTORY ────"));
        data.history.slice(0, 10).forEach((item, idx) => {
          const date = new Date(item.scanned_at).toLocaleString();
          const type = item.proxy_type.toUpperCase();
          const working = chalk.green(item.total_working);
          const checked = chalk.white(item.total_checked);
          console.log(`${chalk.dim(`#${item.id}`)} ${chalk.dim(date)}`);
          console.log(`  ${chalk.cyan(type)} - Working: ${working}/${checked}\n`);
        });
      }
      
      console.log("");
    } catch (err) {
      console.error(chalk.redBright(`\n✘ ${err.message}\n`));
      process.exit(1);
    }
  });

// === COMMAND: regions ===
program
  .command("regions")
  .description(chalk.yellow("List all available regions"))
  .summary("List checking regions")
  .option("--json", "Output as JSON", false)
  .addHelpText('after', `
${chalk.bold("Options:")}
  ${chalk.cyan("--json")}        ${chalk.white("Output in JSON format")} ${chalk.dim("[optional]")}

${chalk.bold("Description:")}
  Lists all available regions for proxy checking.
  Each region represents a different geographical location
  where your proxies will be tested from.

${chalk.bold("Examples:")}
  ${chalk.cyan("$ clearproxy regions")}
  ${chalk.dim("● us1         Washington, USA")}
  ${chalk.dim("● gb1         London, UK")}
  ${chalk.dim("● sg1              Singapore")}

  ${chalk.cyan("$ clearproxy regions --json")}
  ${chalk.dim('{"regions": [{"code": "us", "name": "United States"}]}')}
`)
  .action(async (options) => {
    try {
      const apiKey = loadKey();
      const data = await apiRequest("/regions", apiKey);

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      console.log(chalk.bold.gray("\n──── AVAILABLE REGIONS ────\n"));
      
      if (data.regions && Array.isArray(data.regions)) {
        data.regions.forEach(region => {
          const code = chalk.cyan(region.code || region.id || "?");
          const name = chalk.white(region.name || "Unknown");
          const location = region.location ? chalk.dim(` (${region.location})`) : "";
          const status = region.name === "test1" ? chalk.red("●") : chalk.green("●");
          
          console.log(`  ${status} ${code.padEnd(15)} ${name}${location}`);
        });
      } else if (typeof data === 'object') {
        // If regions are returned as key-value pairs
        Object.entries(data).forEach(([code, info]) => {
          const regionCode = chalk.cyan(code);
          const regionName = typeof info === 'string' ? chalk.white(info) : chalk.white(info.name || code);
          console.log(`  ${chalk.green("●")} ${regionCode.padEnd(15)} ${regionName}`);
        });
      }
      
      console.log("");
    } catch (err) {
      console.error(chalk.redBright(`\n✘ ${err.message}\n`));
      process.exit(1);
    }
  });

// === COMMAND: health ===
program
  .command("health")
  .description(chalk.yellow("Check API health status"))
  .summary("Check API status")
  .addHelpText('after', `
${chalk.bold("Description:")}
  Checks the health and availability of ClearProxy API.
  Returns status, version, uptime and active regions.

${chalk.bold("Example:")}
  ${chalk.cyan("$ clearproxy health")}
  ${chalk.dim("Status        : ")}${chalk.green("ok")}
  ${chalk.dim("API Version   : 1.2.0")}
  ${chalk.dim("Uptime        : 99.98%")}
  ${chalk.dim("Active Regions: 8")}
`)
  .action(async () => {
    try {
      const apiKey = loadKey();
      const data = await apiRequest("/health", apiKey);

      console.log(chalk.bold.gray("\n──── HEALTH STATUS ────"));
      
      const status = data.status || data.health;
      const statusColor = status === "ok" || status === "healthy" ? chalk.green : chalk.red;
      
      console.log(`${chalk.dim("[*]")} Status        : ${statusColor(status || "Unknown")}`);
      
      if (data.version) {
        console.log(`${chalk.dim("[*]")} API Version   : ${chalk.white(data.version)}`);
      }
      
      if (data.uptime) {
        console.log(`${chalk.dim("[*]")} Uptime        : ${chalk.white(data.uptime)}`);
      }
      
      if (data.timestamp) {
        console.log(`${chalk.dim("[*]")} Timestamp     : ${chalk.white(new Date(data.timestamp).toLocaleString())}`);
      }
      
      if (data.regions) {
        console.log(`${chalk.dim("[*]")} Active Regions: ${chalk.white(data.regions)}`);
      }
      
      console.log("");
    } catch (err) {
      console.error(chalk.redBright(`\n✘ ${err.message}\n`));
      process.exit(1);
    }
  });

// === COMMAND: check ===
program
  .command("check [input]")
  .description(chalk.yellow("Check proxies from file, stdin, or inline args"))
  .summary("Check proxy list")
  .option("--region <region>", "Region to use (us1, us2, sg1, jp1, etc.)")
  .option("--timeout <ms>", "Request timeout in milliseconds (default: 4000)", "4000")
  .option("--type <type>", "Proxy type: http, socks4, or socks5 (default: http)", "http")
  .option("--out <file>", "Output file name (default: result.json)", "result.json")
  .option("--format <fmt>", "Output format: json, txt, or yaml (default: json)", "json")
  .option("--simple", "Only show ip:port or auth@ip:port output", false)
  .addHelpText('after', `
${chalk.bold("Arguments:")}
  ${chalk.cyan("input")}         ${chalk.white("Path to proxy file or inline proxies")} ${chalk.dim("[optional]")}
                ${chalk.dim("If not provided, reads from remaining args")}

${chalk.bold("Options:")}
  ${chalk.cyan("--region")}      ${chalk.white("Check region (e.g., us1, us2, sg1)")} ${chalk.dim("[optional]")}
                ${chalk.dim("Default: auto-selected by API")}

  ${chalk.cyan("--timeout")}     ${chalk.white("Timeout per proxy in milliseconds")} ${chalk.dim("[optional]")}
                ${chalk.dim("Default: 4000ms (4 seconds)")}
                ${chalk.dim("Range: 1000-30000")}

  ${chalk.cyan("--type")}        ${chalk.white("Proxy protocol to check")} ${chalk.dim("[optional]")}
                ${chalk.dim("Options: http, socks4, socks5")}
                ${chalk.dim("Default: http")}

  ${chalk.cyan("--out")}         ${chalk.white("Output file path")} ${chalk.dim("[optional]")}
                ${chalk.dim("Default: result.json")}
                ${chalk.dim("Example: --out working-proxies.txt")}

  ${chalk.cyan("--format")}      ${chalk.white("Output format")} ${chalk.dim("[optional]")}
                ${chalk.dim("Options: json, txt, yaml")}
                ${chalk.dim("Default: json")}

  ${chalk.cyan("--simple")}      ${chalk.white("Simplified output (only ip:port)")} ${chalk.dim("[optional]")}
                ${chalk.dim("Shows: ip:port or user:pass@ip:port")}
                ${chalk.dim("Hides: country, speed, anonymity, etc.")}

${chalk.bold("Input Formats:")}
  Supports multiple proxy formats:
  • ${chalk.white("ip:port")}                    ${chalk.dim("→ 1.1.1.1:8080")}
  • ${chalk.white("user:pass@ip:port")}          ${chalk.dim("→ admin:secret@1.1.1.1:8080")}
  • ${chalk.white("ip:port:user:pass")}          ${chalk.dim("→ 1.1.1.1:8080:admin:secret")}

${chalk.bold("Examples:")}
  ${chalk.gray("# Check from file")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt")}

  ${chalk.gray("# Check with specific region")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt --region us")}

  ${chalk.gray("# Check SOCKS5 proxies with custom timeout")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt --type socks5 --timeout 8000")}

  ${chalk.gray("# Check and output as plain text")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt --format txt --out working.txt")}

  ${chalk.gray("# Check inline proxies (no file needed)")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("1.1.1.1:8080 8.8.8.8:3128 9.9.9.9:1080")}

  ${chalk.gray("# Check with simplified output")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt --simple --format txt")}

  ${chalk.gray("# Full example with all options")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt \\")}
    ${chalk.dim("--region us1 \\")}
    ${chalk.dim("--timeout 5000 \\")}
    ${chalk.dim("--type http \\")}
    ${chalk.dim("--format yaml \\")}
    ${chalk.dim("--out results.yaml")}

${chalk.bold("Output:")}
  Results include:
  • Working/Failed proxy count
  • Response time & anonymity level
  • Country & ISP information
  • Checks used & remaining quota
`)
  .action(async (input, options) => {
    try {
      // --- validate type ---
      const allowedTypes = ["http", "socks4", "socks5"];
      if (!allowedTypes.includes(options.type)) {
        throw new Error(`Invalid type '${options.type}'. Allowed: ${allowedTypes.join(", ")}`);
      }

      const apiKey = loadKey();
      let proxies = [];

      // --- Input handling ---
      const absPath = input && path.resolve(process.cwd(), input);
      if (input && fs.existsSync(absPath)) {
        proxies = await parseProxies(absPath);
      } else {
        const args = process.argv.slice(3).filter(a => !a.startsWith("--"));
        proxies = await parseProxies(args);
      }

      if (!proxies.length)
        throw new Error("No proxies found in input. Provide a file or inline proxies.");

      console.log(chalk.dim(`\nChecking ${proxies.length} proxies...`));
      if (options.region)
        console.log(chalk.dim(`→ Region: ${chalk.gray(options.region)}`));
      console.log(chalk.dim(`→ Timeout: ${chalk.gray(options.timeout)}ms`));
      console.log(chalk.dim(`→ Type   : ${chalk.gray(options.type)}\n`));

      const spinner = ora(chalk.dim("Blink and it will done...")).start();

      const res = await fetch(`${API_BASE}/check`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proxies,
          region: options.region || undefined,
          timeout: Number(options.timeout),
          type: options.type || "http",
        }),
      });

      if (!res.ok) {
        spinner.fail(chalk.red(`API Error: ${res.status}`));
        const text = await res.text();
        throw new Error(text);
      }

      const data = await res.json();
      spinner.succeed(chalk.white("Sent."));

      if (!data.result_url)
        throw new Error("Unexpected API response: missing result_url");

      const resultRes = await fetch(data.result_url);
      if (!resultRes.ok)
        throw new Error(`Failed to fetch result: ${resultRes.status}`);
      const resultData = await resultRes.json();

      const { summary = {}, metadata = {}, proxies: proxiesOut = [] } = resultData;

      // --- Summary & Output ---
      const totalWorking = summary.total_working || 0;
      const totalChecked = metadata.total_checked || proxiesOut.length;
      const totalFailed = Math.max(totalChecked - totalWorking, 0);

      const formatted = formatOutput(proxiesOut, options.format, options.simple);
      fs.writeFileSync(options.out, formatted);
      console.log(
        chalk.white(`\nResults saved to ${chalk.gray(options.out)} (${options.format})\n`)
      );

      // === CLEAN SUMMARY (flat, one-line items) ===
      console.log(chalk.bold.gray("──── SUMMARY ────"));
      console.log(`${chalk.dim("[+]")} Working     : ${chalk.white(totalWorking)}`);
      console.log(`${chalk.dim("[-]")} Failed      : ${chalk.white(totalFailed)}`);
      console.log(`${chalk.dim("[*]")} Total Check : ${chalk.white(totalChecked)}`);
      console.log(`${chalk.dim("[>]")} Checks Used : ${chalk.white(metadata.user?.checks_used || "?")}`);
      console.log(`${chalk.dim("[>]")} Region Used : ${chalk.white(metadata.region_name || metadata.region_used || options.region || "?")}`);
      console.log(`${chalk.dim("[>]")} Timeout     : ${chalk.white(metadata.timeout_used || options.timeout + "ms")}`);
      console.log(`${chalk.dim("[>]")} Type        : ${chalk.white(options.type || metadata.type_used || "http")}`);

      if (summary.countries) {
        const totalCountries = Object.keys(summary.countries).length;
        console.log(`${chalk.dim("[*]")} Countries   : ${chalk.white(totalCountries)}`);
      }

      if (summary.anonymity_levels) {
        const anon = summary.anonymity_levels;
        console.log(
          `${chalk.dim("[*]")} Anonymity   : ${chalk.white(
            `elite=${anon.elite || 0}, anonymous=${anon.anonymous || 0}, transparent=${anon.transparent || 0}`
          )}`
        );
      }

      if (metadata.processing_time)
        console.log(`${chalk.dim("[>]")} Took        : ${chalk.white(metadata.processing_time)}\n`);

      console.log(chalk.dim("Done.\n"));
    } catch (err) {
      console.error(chalk.redBright(`\n✘ ${err.message}\n`));
      process.exit(1);
    }
  });

// === CUSTOM HELP OUTPUT ===
// Only show Quick Start when no command is specified (just "clearproxy" or "clearproxy --help")
const isRootHelp = process.argv.length === 2 || 
                    (process.argv.length === 3 && (process.argv[2] === '--help' || process.argv[2] === '-h'));

if (isRootHelp) {
  program.addHelpText(
    "beforeAll",
    chalk.white(`
╭──────────────────────────────────────────────╮
│              ${chalk.gray("ClearProxy.io CLI")}               │
╰──────────────────────────────────────────────╯
`)
  );

  program.addHelpText(
    "afterAll",
    `
${chalk.bold("Quick Start:")}
  ${chalk.cyan("1.")} Set your API key      ${chalk.dim("→")} ${chalk.cyan("clearproxy set-key")} ${chalk.dim("<your_key>")}
  ${chalk.cyan("2.")} Check your account    ${chalk.dim("→")} ${chalk.cyan("clearproxy me")}
  ${chalk.cyan("3.")} Check proxies         ${chalk.dim("→")} ${chalk.cyan("clearproxy check")} ${chalk.dim("proxies.txt")}

${chalk.bold("Need Help?")}
  Run ${chalk.cyan("clearproxy <command> --help")} for detailed info on any command.
  Example: ${chalk.cyan("clearproxy check --help")}

${chalk.bold("Documentation:")}
  ${chalk.dim("https://docs.clearproxy.io")}
`
  );
}

program.parse();