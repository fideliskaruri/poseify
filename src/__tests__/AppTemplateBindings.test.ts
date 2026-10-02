import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guard against the bug this file exists for.
 *
 * vue-tsc type checks the script block of a .vue file but reports nothing for a
 * template that references a binding the script never destructured: the render
 * throws at runtime, the page goes half-blank, and the only signal is a
 * "[Vue warn] Property X was accessed during render" line in the console.
 *
 * That happened three times in this codebase, so it gets a test.
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "App.vue");
const source = readFileSync(APP, "utf8");

/** The two halves of an SFC. */
const script = source.slice(
  source.indexOf("<script setup"),
  source.indexOf("</script>"),
);
const template = source.slice(
  source.indexOf("<template>"),
  source.lastIndexOf("</template>"),
);

const IDENT = /^[A-Za-z_$][\w$]*$/;

/**
 * Names that appear in a template but are not script bindings.
 *
 * Three sources, all structural rather than lexical:
 *   - `$event`, the implicit handler parameter.
 *   - Type assertions, e.g. `($event.target as HTMLInputElement).value`.
 *     The `as X` suffix makes the tail a type name, not a value.
 *   - Object literal keys, e.g. `:class="{ on: locked }"` binds `locked`, but
 *     `{ kind: 'bone', name }` also mentions nothing that needs declaring.
 */
const STRUCTURAL = new Set(["$event", "true", "false", "null", "undefined"]);

/** Drop `as Foo` type assertions before splitting an expression. */
function stripTypes(text: string): string {
  return text.replace(/\s+as\s+[A-Za-z_$][\w$.<>[\]]*/g, " ");
}

/**
 * Drop object-literal keys: `{ tile: true }`, `{ azimuth: 40 }`.
 *
 * The key is a property name, not a binding. Removing `name:` before splitting
 * keeps the value side, which is the part that can actually be unbound.
 */
function stripObjectKeys(text: string): string {
  return text.replace(/(^|[\s{(,])[\w$]+\s*:(?!:)/g, "$1 ");
}

/**
 * Identifiers a template expression mentions, reduced to bare names.
 *
 * Only looks at `{{ name }}` and `:attr="name"` forms, which is where the
 * missing-binding bug appeared each time.
 */
function templateIdentifiers(text: string): string[] {
  const found = new Set<string>();

  for (const match of text.matchAll(/\{\{([^}]*)\}\}/g)) {
    for (const token of stripObjectKeys(stripStrings(stripTypes(match[1]))).split(/[\s()?:,{}]+/)) {
      const name = token.split(/[.[]/)[0].trim();
      if (IDENT.test(name) && !STRUCTURAL.has(name)) found.add(name);
    }
  }

  for (const match of text.matchAll(/\s[:@v][\w.-]*="([^"]*)"/g)) {
    for (const token of stripObjectKeys(stripStrings(stripTypes(match[1]))).split(/[\s()?:,!{}]+/)) {
      const name = token.split(/[.[]/)[0].trim();
      if (IDENT.test(name) && !STRUCTURAL.has(name)) found.add(name);
    }
  }

  return [...found];
}

/**
 * Remove quoted runs before scanning for identifiers.
 *
 * Otherwise the prose in help text and tooltips ("Click a joint, then drag the
 * rotation rings") contributes every English word in the interface as a
 * supposed missing binding.
 */
function stripStrings(text: string): string {
  return text
    .replace(/'[^']*'/g, " ")
    .replace(/"[^"]*"/g, " ")
    .replace(/`[^`]*`/g, " ");
}

/**
 * Names a v-for introduces into the template's own scope.
 *
 * A loop alias is local, so requiring the script to declare it would report
 * every loop variable as missing.
 */
function loopAliases(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(/v-for="\(?[^"]*?\(\s*([\w$]+)/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/v-for="[^"]*?,\s*([\w$]+)\s*\)\s*(?:in|of)/g)) {
    names.add(match[1]);
  }
  // `v-for="row in list"` with a single alias.
  for (const match of text.matchAll(/v-for="([\w$]+)\s+(?:in|of)\s/g)) {
    names.add(match[1]);
  }
  // Array destructuring: `v-for="[family, items] in groups"`. Both names are
  // template-local, and the second is easy to miss because it is only used a
  // few lines later rather than in the loop header.
  for (const match of text.matchAll(/v-for="\[\s*([\w$]+)\s*,\s*([\w$]+)\s*\]/g)) {
    names.add(match[1]);
    names.add(match[2]);
  }
  return names;
}

/** JS globals Vue templates can reach without a declaration. */
const BUILT_INS = new Set([
  "true", "false", "null", "undefined",
  "Math", "Object", "Array", "String", "Number", "Boolean", "JSON", "Date",
  "Infinity", "NaN",
]);

function isDeclared(name: string): boolean {
  const escaped = name.replace(/\$/g, "\\$");
  return new RegExp("\\b" + escaped + "\\b").test(script);
}

/**
 * Variables an inline handler declares for itself.
 *
 * `@click="(() => { const obj = load(); ... })()"` is self-contained: `obj` is
 * bound by the arrow function inside the template, not by the script block.
 */
function handlerLocals(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(/\bconst\s+([\w$]+)/g)) {
    names.add(match[1]);
  }
  return names;
}

describe("App.vue template bindings", () => {
  it("declares every identifier the template uses", () => {
    const aliases = loopAliases(template);
    const locals = handlerLocals(template);
    const missing = templateIdentifiers(template).filter(
      (name) =>
        !BUILT_INS.has(name) &&
        !aliases.has(name) &&
        !locals.has(name) &&
        !isDeclared(name),
    );
    expect(missing).toEqual([]);
  });

  it("destructures the composable rather than shadowing it", () => {
    expect(script).toContain("usePosing()");
  });
});
