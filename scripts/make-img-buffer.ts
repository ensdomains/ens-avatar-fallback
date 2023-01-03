import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const file = readFileSync(resolve(__dirname, "./circle.png"));
const json = file.toJSON();

writeFileSync(
  resolve(__dirname, "../src/circle.json"),
  JSON.stringify(json.data)
);
