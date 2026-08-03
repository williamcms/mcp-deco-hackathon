const proc = Bun.spawn(["deco", "link", "-p", "3001", "--", "bun", "run", "dev"], {
	stdout: "pipe",
	stderr: "inherit",
	stdin: "inherit",
});

for await (const chunk of proc.stdout) {
	const text = new TextDecoder().decode(chunk);
	process.stdout.write(text);
	const match = text.match(/Preview: (https:\/\/[^\s]+)/);
	if (match) {
		process.stdout.write(`   -> 🔗 MCP URL: ${match[1]}/api/mcp\n`);
	}
}
