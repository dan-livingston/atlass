#!/usr/bin/env node
import { buildStandalone } from "#/cli/build.ts";
import { fail } from "#/cli/run.ts";

buildStandalone("bitbucket").parseAsync().catch(fail);
