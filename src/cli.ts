#!/usr/bin/env node
import { buildAtlass } from "#/cli/build.ts";
import { fail } from "#/cli/run.ts";

buildAtlass().parseAsync().catch(fail);
