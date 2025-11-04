# ClearProxy CLI & SDK

**ClearProxy** is a fast, modern CLI and SDK for checking, validating proxy lists using the [ClearProxy.io API](https://clearproxy.io).  
Built for developers and automation environments that need accurate proxy health results in seconds.

---

## Installation

### Using npm

```bash
# Install CLI globally
npm install -g clearproxy

# Or install SDK for Node.js usage
npm install clearproxy
````

---

## Quick Start (CLI)

###  Set your API key

```bash
clearproxy set-key clearpx_yourkey
```

###  Check your account

```bash
clearproxy me
```

###  Check proxies from a file

```bash
clearproxy check proxies.txt
```

---

## CLI Examples

### Basic check

```bash
clearproxy check proxies.txt
```

### Specify region and type

```bash
clearproxy check proxies.txt --region us --type socks5
```

### Save as plain text

```bash
clearproxy check proxies.txt --format txt --out working.txt --simple
```

### Inline proxies

```bash
clearproxy check 1.1.1.1:8080 8.8.8.8:3128
```

> [!NOTE]
> For more information about the CLI, run `clearproxy check --help` to see all available options.


### Show API regions

```bash
clearproxy regions
```



---

## SDK Usage (Node.js)

```js
import { ClearProxy } from "clearproxy";
import fs from "fs";

const client = new ClearProxy("clearpx_yourkey");

(async () => {
  const result = await client.check("proxies.txt", {
    region: "us1",
    timeout: 4000,
    type: "http"
  });

  console.log("Summary:", result.summary);
  console.log("Working:", result.working.length);

  // Save to file
  fs.writeFileSync("working.txt", client.export(result.working, "txt", true));
})();
```

---




---

## Documentation

* **Website:** [https://clearproxy.io](https://clearproxy.io)
* **Docs:** [https://docs.clearproxy.io](https://docs.clearproxy.io)

---

## License

MIT License
© 2025 [ClearProxy](https://github.com/ClearProxy)
