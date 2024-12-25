import React, { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMetrics } from '@datadog/browser-rum';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import DashboardLayout from '../../layouts/DashboardLayout';
import LibraryTree from '../../components/library/LibraryTree';
import { useLibrary } from '../../hooks/useLibrary';
import { Library } from '../../types/library';

// Styled components and Material UI components
import styled from '@emotion/styled';
import { Card, Typography, Button, Skeleton, Alert } from '@mui/material';
import { VisibilityIcon, LockIcon, PublicIcon } from '@mui/icons-material';

// Styled components
const Container = styled.div`
  display: flex;
  gap: 24px;
  height: calc(100vh - 64px);
  padding: 24px;
  overflow: hidden;
`;

const Sidebar = styled.div`
  width: 280px;
  min-width: 280px;
  background: ${({ theme }) => theme.palette.background.paper};
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  overflow-y: auto;
`;

const MainContent = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const LibraryHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const LibraryMetadata = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const StatsCard = styled(Card)`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

/**
 * Library view page component implementing Material Design 3.0 specifications
 * with enhanced security controls and real-time updates
 */
const LibraryView: React.FC = () => {
  // Hooks
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addMetric } = useMetrics();
  const { 
    libraries,
    loading,
    error,
    getLibraryById,
    validateAccess,
    fetchLibraries,
    subscribeToUpdates
  } = useLibrary();

  // Local state
  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // Load library data and validate access
  useEffect(() => {
    const loadLibrary = async () => {
      if (!id) {
        navigate('/libraries');
        return;
      }

      try {
        // Validate access before loading
        const hasAccess = await validateAccess(id);
        if (!hasAccess) {
          setAccessDenied(true);
          return;
        }

        await fetchLibraries();
        const library = getLibraryById(id);
        setSelectedLibrary(library || null);

        // Track page load metrics
        addMetric('library_view_loaded', 1, {
          libraryId: id
        });
      } catch (err) {
        console.error('Failed to load library:', err);
      }
    };

    loadLibrary();
  }, [id, navigate, fetchLibraries, getLibraryById, validateAccess, addMetric]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!id) return;

    const unsubscribe = subscribeToUpdates(id, (updatedLibrary) => {
      setSelectedLibrary(updatedLibrary);
    });

    return () => unsubscribe();
  }, [id, subscribeToUpdates]);

  // Handle library selection
  const handleLibrarySelect = useCallback((libraryId: string) => {
    navigate(`/libraries/${libraryId}`);
  }, [navigate]);

  // Error handler for error boundary
  const handleError = useCallback((error: Error) => {
    console.error('Library view error:', error);
    addMetric('library_view_error', 1, {
      error: error.message
    });
  }, [addMetric]);

  // Render loading state
  if (loading) {
    return (
      <DashboardLayout>
        <Container>
          <Sidebar>
            <Skeleton variant="rectangular" height={400} />
          </Sidebar>
          <MainContent>
            <Skeleton variant="rectangular" height={200} />
            <Skeleton variant="rectangular" height={400} />
          </MainContent>
        </Container>
      </DashboardLayout>
    );
  }

  // Render access denied state
  if (accessDenied) {
    return (
      <DashboardLayout>
        <Container>
          <Alert 
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => navigate('/libraries')}>
                Back to Libraries
              </Button>
            }
          >
            You don't have permission to view this library
          </Alert>
        </Container>
      </DashboardLayout>
    );
  }

  // Render error state
  if (error) {
    return (
      <DashboardLayout>
        <Container>
          <Alert 
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => navigate('/libraries')}>
                Back to Libraries
              </Button>
            }
          >
            {error}
          </Alert>
        </Container>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ErrorBoundary
        onError={handleError}
        fallbackRender={({ error }) => (
          <Alert severity="error">
            {error.message}
          </Alert>
        )}
      >
        <Container>
          <Sidebar>
            <LibraryTree
              onSelect={handleLibrarySelect}
              selectedId={id || null}
              draggable={false}
            />
          </Sidebar>

          <MainContent>
            {selectedLibrary && (
              <>
                <LibraryHeader>
                  <div>
                    <Typography variant="h4" gutterBottom>
                      {selectedLibrary.name}
                    </Typography>
                    <Typography variant="body1" color="textSecondary">
                      {selectedLibrary.description}
                    </Typography>
                  </div>
                  {selectedLibrary.visibility === 'public' && <PublicIcon />}
                  {selectedLibrary.visibility === 'private' && <LockIcon />}
                  {selectedLibrary.visibility === 'organization' && <VisibilityIcon />}
                </LibraryHeader>

                <LibraryMetadata>
                  <StatsCard>
                    <Typography variant="h6">Detections</Typography>
                    <Typography variant="h4">{selectedLibrary.detectionCount || 0}</Typography>
                  </StatsCard>
                  <StatsCard>
                    <Typography variant="h6">Contributors</Typography>
                    <Typography variant="h4">{selectedLibrary.contributorCount || 0}</Typography>
                  </StatsCard>
                  <StatsCard>
                    <Typography variant="h6">Last Updated</Typography>
                    <Typography variant="body1">
                      {new Date(selectedLibrary.updatedAt).toLocaleDateString()}
                    </Typography>
                  </StatsCard>
                </LibraryMetadata>

                {/* Additional library content would go here */}
              </>
            )}
          </MainContent>
        </Container>
      </ErrorBoundary>
    </DashboardLayout>
  );
};

export default LibraryView;