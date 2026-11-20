// Level B: the executor contract on the paper world.
import { test } from 'node:test';
import { executorContract } from './core-executor.contract.mjs';
import { createPaperWorld } from '../core/paper-world.js';

test('executor contract: paper world', () => executorContract(createPaperWorld));
