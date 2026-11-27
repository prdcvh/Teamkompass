import { jiraUrl } from './model'
import type { Approval } from './model'

type Els = { Box: any; Text: any; Button: any; Link: any }

/** So viele Zeilen je Abschnitt, der Rest steht als „… und n weitere“. */
const MAX_ROWS = 4

/**
 * Die Freigabe-Leiste über dem Eingabefeld (SCRUM-241, Variante B): zeigt am Ende eines Runs nur an,
 * welche PRs auf die Freigabe des PO warten. Der Knopf je Ticket öffnet Jira; die Leiste merged nie
 * und schreibt nichts in den Chat. „Später“ blendet sie aus.
 */
export function ApprovalBar({ Box, Text, Button, Link }: Els, approval: Approval, onLater: () => unknown) {
  const { ready, decide } = approval
  const more = (n: number) => (n > MAX_ROWS ? <Text dimColor>… und {n - MAX_ROWS} weitere</Text> : null)

  return (
    <Box flexDirection="column">
      {ready.length > 0 && (
        <Text bold>
          {ready.length} {ready.length === 1 ? 'PR wartet' : 'PRs warten'} auf deine Freigabe in Jira
        </Text>
      )}
      {ready.slice(0, MAX_ROWS).map(t => (
        <Box key={t.key}>
          <Text>
            #{t.pr} ({t.key}){' '}
          </Text>
          <Link href={jiraUrl(t.key)} label="In Jira öffnen" />
        </Box>
      ))}
      {more(ready.length)}
      {decide.length > 0 && (
        <Text color="yellow" bold>
          Wartet auf deine Entscheidung (nicht freigeben, erst entscheiden):
        </Text>
      )}
      {decide.slice(0, MAX_ROWS).map(({ ticket: t, reason }) => (
        <Box key={t.key} flexDirection="column">
          <Text color="yellow">
            ⚠ {t.pr !== null ? `#${t.pr} ` : ''}({t.key}, {t.pr !== null ? 'Draft' : t.status}): {reason}
          </Text>
          <Link href={jiraUrl(t.key)} label="In Jira öffnen" />
        </Box>
      ))}
      {more(decide.length)}
      {ready.length > 0 && (
        <Text dimColor>
          Setzt du ein Ticket in Jira auf „Genehmigt“, merged der nächste Run den PR. Das geht live für die echten
          Teams U15, U17 und das Hauptteam.
        </Text>
      )}
      <Button key="later" label="Später" onPress={onLater} />
    </Box>
  )
}
