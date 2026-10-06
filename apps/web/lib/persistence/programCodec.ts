import { parseStoredExecutionInput } from '@courtiq/basketball/execution'
import { createProgramCodec } from '@courtiq/basketball/program'

export const programCodec = createProgramCodec({ execution: parseStoredExecutionInput })
