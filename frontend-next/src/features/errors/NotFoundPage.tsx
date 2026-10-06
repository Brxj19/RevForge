import { usePalette } from "~/features/palette";
import { Button, ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { DocumentPage } from "~/ui/WorkspaceLayout";

/** 404. Also what anonymous visitors see for private repositories (never leak existence). */
export default function NotFoundPage() {
  const palette = usePalette();
  return (
    <DocumentPage>
      <Card>
        <EmptyState
          art="not-found"
          size="page"
          level={2}
          actions={
            <>
              <ButtonLink href="/" variant="primary">
                Go home
              </ButtonLink>
              <Button onClick={() => palette.open()}>Search instead</Button>
            </>
          }
        />
      </Card>
    </DocumentPage>
  );
}
