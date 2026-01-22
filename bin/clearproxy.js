#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { Command } from "commander";
import fetch from "node-fetch";
import WebSocket from "ws";
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
  .version("1.3.0", "-v, --version", "Show version info")
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

      const subscription = user.subscription_detail || {};
      const isUnlimited = subscription.UnlimitedPro === true || user.UnlimitedPro === true;
      const expiredAt = subscription.unlimited_expired_at || user.unlimited_expired_at;

      console.log(chalk.bold.gray("\n──── ACCOUNT INFO ────"));
      console.log(`${chalk.dim("[*]")} User ID       : ${chalk.white(userId)}`);
      console.log(`${chalk.dim("[*]")} Email         : ${chalk.white(email)}`);

      if (isUnlimited) {
        console.log(`${chalk.dim("[+]")} Subscription  : ${chalk.cyan("Unlimited Pro")}`);
        if (expiredAt) {
          const expiryDate = new Date(expiredAt).toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
          console.log(`${chalk.dim("[*]")} Plan Expires : ${chalk.white(expiryDate)}`);
        }
      } else {
        console.log(`${chalk.dim("[+]")} Subscription  : ${chalk.dim("None")}`);
        console.log(`${chalk.dim("[+]")} Checks Left  : ${chalk.green(checks.toLocaleString())}`);
      }

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
  .option("--custom <json>", "Custom URL validation as JSON array or file path")
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

${chalk.bold("Custom URL Validation:")}
  ${chalk.cyan("--custom")}      ${chalk.white("JSON array or file path (.json)")} ${chalk.dim("[optional]")}
  
  ${chalk.bold("Option 1: JSON String (Linux/Mac):")}
  '[{"url":"...","requiredStatusCodes":[...],"requiredText":"...","caseSensitive":true}]'
  
  ${chalk.bold("Option 2: JSON File (Windows/All):")}
  Create a file (e.g., custom.json) and pass the file path
  
  ${chalk.bold("Fields:")}
  • ${chalk.white("url")}                    ${chalk.dim("Target URL to test")} ${chalk.red("[required]")}
  • ${chalk.white("requiredStatusCodes")}    ${chalk.dim("Valid HTTP status codes")} ${chalk.dim("[optional, default: [200]]")}
  • ${chalk.white("requiredText")}           ${chalk.dim("Text that must appear in response")} ${chalk.dim("[optional]")}
  • ${chalk.white("caseSensitive")}          ${chalk.dim("Case-sensitive text matching")} ${chalk.dim("[optional, default: false]")}

${chalk.bold("Input Formats:")}
  Supports multiple proxy formats:
  • ${chalk.white("ip:port")}                    ${chalk.dim("→ 1.1.1.1:8080")}
  • ${chalk.white("user:pass@ip:port")}          ${chalk.dim("→ admin:secret@1.1.1.1:8080")}
  • ${chalk.white("ip:port:user:pass")}          ${chalk.dim("→ 1.1.1.1:8080:admin:secret")}

${chalk.bold("Examples:")}
  ${chalk.gray("# Basic check from file")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt")}

  ${chalk.gray("# Check with specific region")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt --region us1")}

  ${chalk.gray("# Check SOCKS5 proxies with custom timeout")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt --type socks5 --timeout 8000")}

  ${chalk.gray("# Windows: Using JSON file (RECOMMENDED)")}
  ${chalk.gray("# 1. Create custom.json:")}
  ${chalk.dim('[{"url":"https://discord.com","requiredStatusCodes":[200,301,302]}]')}
  ${chalk.gray("# 2. Run command:")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt --custom custom.json")}

  ${chalk.gray("# Windows: Multiple URLs in file")}
  ${chalk.gray("# Create custom.json:")}
  ${chalk.dim('[')}
  ${chalk.dim('  {"url":"https://discord.com","requiredStatusCodes":[200,301,302]},')}
  ${chalk.dim('  {"url":"https://www.google.com","requiredStatusCodes":[200],"requiredText":"Search"}')}
  ${chalk.dim(']')}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt --custom custom.json")}

  ${chalk.gray("# Linux/Mac: Direct JSON string")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt \\")}
    ${chalk.dim('--custom \'[{"url":"https://discord.com","requiredStatusCodes":[200,301,302]}]\'')}

  ${chalk.gray("# E-commerce proxy validation (file method)")}
  ${chalk.gray("# Create ecommerce.json:")}
  ${chalk.dim('[')}
  ${chalk.dim('  {"url":"https://shop.com/products","requiredStatusCodes":[200],"requiredText":"Add to Cart"},')}
  ${chalk.dim('  {"url":"https://shop.com/cart","requiredStatusCodes":[200,302]}')}
  ${chalk.dim(']')}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt --custom ecommerce.json")}

  ${chalk.gray("# Check inline proxies (no file needed)")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("1.1.1.1:8080 8.8.8.8:3128 9.9.9.9:1080")}

  ${chalk.gray("# Full example with custom validation")}
  ${chalk.cyan("$ clearproxy check")} ${chalk.dim("proxies.txt \\")}
    ${chalk.dim("--region us1 \\")}
    ${chalk.dim("--timeout 5000 \\")}
    ${chalk.dim("--type http \\")}
    ${chalk.dim("--custom custom.json \\")}
    ${chalk.dim("--format json \\")}
    ${chalk.dim("--out validated.json")}

${chalk.bold("Output:")}
  Results include:
  • Working/Failed proxy count
  • Response time & anonymity level
  • Country & ISP information
  • Checks used & remaining quota
  • Custom URL validation results (if --custom used)
  • Success rate percentage for each custom URL
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

      // Parse custom URLs
      let customUrls = [];
      if (options.custom) {
        try {
          // Check if it's a file path
          const customPath = path.resolve(process.cwd(), options.custom);
          if (fs.existsSync(customPath) && customPath.endsWith('.json')) {
            // Read from file
            const fileContent = fs.readFileSync(customPath, 'utf8');
            customUrls = JSON.parse(fileContent);
          } else {
            // Try to parse as JSON string
            customUrls = JSON.parse(options.custom);
          }

          if (!Array.isArray(customUrls)) {
            throw new Error("--custom must be a JSON array");
          }
          // Validate each custom URL
          customUrls.forEach((urlConfig, idx) => {
            if (!urlConfig.url) {
              throw new Error(`Custom URL at index ${idx} is missing 'url' field`);
            }
          });
        } catch (err) {
          if (err.message.includes('missing')) {
            throw err; // Re-throw validation errors
          }
          console.error(chalk.red("\n✘ Invalid --custom JSON format"));
          console.log(chalk.yellow("\nTip for Windows users:"));
          console.log(chalk.dim("  1. Create a file (e.g., custom.json) with your validation rules"));
          console.log(chalk.dim("  2. Pass the file: ") + chalk.cyan("--custom custom.json"));
          console.log(chalk.yellow("\nExample custom.json:"));
          console.log(chalk.dim('  ['));
          console.log(chalk.dim('    {"url":"https://discord.com","requiredStatusCodes":[200,301,302]},'));
          console.log(chalk.dim('    {"url":"https://google.com","requiredStatusCodes":[200]}'));
          console.log(chalk.dim('  ]'));
          console.log("");
          throw new Error(`Failed to parse --custom: ${err.message}`);
        }
      }

      console.log(chalk.dim(`\nChecking ${proxies.length} proxies...`));
      if (options.region)
        console.log(chalk.dim(`→ Region: ${chalk.gray(options.region)}`));
      console.log(chalk.dim(`→ Timeout: ${chalk.gray(options.timeout)}ms`));
      console.log(chalk.dim(`→ Type   : ${chalk.gray(options.type)}`));

      if (customUrls.length > 0) {
        console.log(chalk.dim(`→ Custom URLs: ${chalk.gray(customUrls.length)} validation(s)`));
        customUrls.forEach((urlConfig, idx) => {
          console.log(chalk.dim(`  ${idx + 1}. ${chalk.gray(urlConfig.url)}`));
        });
      }
      console.log("");

      const jobId = `cli_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
      const spinner = ora(chalk.dim("Uploading Your Proxy List...")).start();

      // Start WebSocket for real-time progress
      const wsURL = `${API_BASE.replace("http", "ws")}/ws?jobId=${jobId}`;
      const ws = new WebSocket(wsURL);

      ws.on("message", (data) => {
        try {
          const event = JSON.parse(data);
          if (event.details && event.details.message) {
            spinner.text = chalk.dim(event.details.message);
          }
        } catch (e) { }
      });

      ws.on("error", () => { });

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
          customUrls: customUrls.length > 0 ? customUrls : undefined,
          jobId
        }),
      });

      if (!res.ok) {
        ws.close();
        spinner.fail(chalk.red(`API Error: ${res.status}`));
        const text = await res.text();
        throw new Error(text);
      }

      const data = await res.json();
      ws.close();
      spinner.succeed(chalk.white("Sent."));

      if (!data.result_url)
        throw new Error("Unexpected API response: missing result_url");

      const resultRes = await fetch(data.result_url);
      if (!resultRes.ok)
        throw new Error(`Failed to fetch result: ${resultRes.status}`);
      const resultData = await resultRes.json();

      // Extract data from response
      const summary = resultData.summary || {};
      const metadata = resultData.metadata || data.metadata || {};
      const proxiesOut = resultData.proxies || [];

      // Custom URL validation can be in multiple places
      const custom_url_validation = resultData.custom_url_validation || data.custom_url_validation || null;

      // --- Summary & Output ---
      const totalWorking = summary.total_working || 0;
      const totalChecked = metadata.total_checked || proxiesOut.length;
      const totalFailed = Math.max(totalChecked - totalWorking, 0);

      // Save full data if custom validation exists, otherwise save formatted output
      if (custom_url_validation) {
        // Save complete response with custom validation
        const fullOutput = {
          summary,
          metadata,
          proxies: proxiesOut,
          custom_url_validation
        };
        fs.writeFileSync(options.out, JSON.stringify(fullOutput, null, 2));
        console.log(
          chalk.white(`\nResults saved to ${chalk.gray(options.out)} (with custom validation)\n`)
        );
      } else {
        // Save normal formatted output
        const formatted = formatOutput(proxiesOut, options.format, options.simple);
        fs.writeFileSync(options.out, formatted);
        console.log(
          chalk.white(`\nResults saved to ${chalk.gray(options.out)} (${options.format})\n`)
        );
      }

      const userMeta = metadata.user || {};
      const subDetail = userMeta.subscription_detail || {};
      const isUnlimitedPlan = subDetail.UnlimitedPro === true || userMeta.UnlimitedPro === true;

      console.log(chalk.bold.gray("──── SUMMARY ────"));
      console.log(`${chalk.dim("[+]")} Working     : ${chalk.white(totalWorking)}`);
      console.log(`${chalk.dim("[-]")} Failed      : ${chalk.white(totalFailed)}`);
      console.log(`${chalk.dim("[*]")} Total Check : ${chalk.white(totalChecked)}`);

      if (isUnlimitedPlan) {
        console.log(`${chalk.dim("[>]")} Plan        : ${chalk.cyan("Unlimited Pro")}`);
      } else {
        console.log(`${chalk.dim("[>]")} Checks Used : ${chalk.white(userMeta.checks_used || "?")}`);
      }

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
        console.log(`${chalk.dim("[>]")} Took        : ${chalk.white(metadata.processing_time)}`);

      // === CUSTOM URL VALIDATION RESULTS ===
      if (custom_url_validation) {
        console.log(chalk.bold.gray("\n──── CUSTOM URL VALIDATION ────"));

        // Show summary if available
        if (custom_url_validation.summary) {
          const cvSummary = custom_url_validation.summary;
          console.log(chalk.white("\nOverall Summary:"));
          if (cvSummary.total_urls_tested) {
            console.log(`${chalk.dim("[*]")} URLs Tested   : ${chalk.white(cvSummary.total_urls_tested)}`);
          }
          if (cvSummary.total_proxies_tested) {
            console.log(`${chalk.dim("[*]")} Proxies Tested: ${chalk.white(cvSummary.total_proxies_tested)}`);
          }
          if (cvSummary.processing_time) {
            console.log(`${chalk.dim("[>]")} Processing    : ${chalk.white(cvSummary.processing_time)}`);
          }
        }

        // Show per-URL results
        const perUrlResults = custom_url_validation.per_url_summary ||
          custom_url_validation.results ||
          (Array.isArray(custom_url_validation) ? custom_url_validation : []);

        if (perUrlResults && perUrlResults.length > 0) {
          console.log(chalk.white("\nPer-URL Results:"));
          perUrlResults.forEach((result, idx) => {
            console.log(chalk.white(`\n[${idx + 1}] ${result.url}`));
            console.log(`${chalk.dim("[*]")} Tested        : ${chalk.white(result.total_tested || result.total_proxies_tested || '?')}`);
            console.log(`${chalk.dim("[+]")} Success       : ${chalk.green(result.success_count)} ${chalk.dim(`(${result.success_rate})`)}`);
            console.log(`${chalk.dim("[-]")} Failed        : ${chalk.red(result.failed_count)} ${chalk.dim(`(${((result.failed_count / (result.total_tested || result.success_count + result.failed_count || 1)) * 100).toFixed(2)}%)`)}`);

            if (result.requiredText) {
              const caseSensitive = result.caseSensitive ? " (case-sensitive)" : "";
              console.log(`${chalk.dim("[>]")} Required Text : ${chalk.white(result.requiredText)}${chalk.dim(caseSensitive)}`);
            }

            if (result.requiredStatusCodes && result.requiredStatusCodes.length > 0) {
              console.log(`${chalk.dim("[>]")} Status Codes  : ${chalk.white(result.requiredStatusCodes.join(', '))}`);
            }

            if (result.error) {
              console.log(`${chalk.dim("[!]")} Error         : ${chalk.red(result.error)}`);
            }
          });
        }
      }

      console.log(chalk.dim("\nDone.\n"));
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