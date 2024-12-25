# External imports with version tracking
import aiohttp  # aiohttp v3.8+
from github import Github, GithubException  # PyGithub v1.59+
from github.Repository import Repository
from github.ContentFile import ContentFile
from github.PullRequest import PullRequest
import base64  # standard library
import json  # standard library
from prometheus_client import Counter, Gauge  # prometheus_client v0.17+
from typing import List, Dict, Optional, Tuple
import logging
import asyncio
from functools import wraps
from datetime import datetime

# Internal imports
from ...core.config import settings
from ...models.detection import Detection

# Configure logging
logger = logging.getLogger(__name__)

def singleton(cls):
    """Decorator to ensure single instance of GitHubService"""
    instances = {}
    def get_instance(*args, **kwargs):
        if cls not in instances:
            instances[cls] = cls(*args, **kwargs)
        return instances[cls]
    return get_instance

@singleton
class GitHubService:
    """
    Enterprise-grade service for managing GitHub repository operations with
    advanced features including batch processing, monitoring, and error handling.
    """
    
    def __init__(self, enterprise_url: Optional[str] = None, use_enterprise: bool = False):
        """
        Initialize GitHub service with enterprise support and monitoring.
        
        Args:
            enterprise_url: Optional GitHub Enterprise URL
            use_enterprise: Flag to enable enterprise features
        """
        # Initialize GitHub client
        base_url = enterprise_url if use_enterprise else settings.GITHUB_API_URL
        self.api_token = settings.GITHUB_API_TOKEN
        self._client = Github(
            base_url=base_url,
            login_or_token=self.api_token,
            timeout=30,
            retry=3
        )
        
        # Initialize async HTTP session with retry configuration
        self._session = aiohttp.ClientSession(
            headers={"Authorization": f"token {self.api_token}"},
            timeout=aiohttp.ClientTimeout(total=30),
            raise_for_status=True
        )
        
        # Initialize Prometheus metrics
        self.api_calls_total = Counter(
            'github_api_calls_total',
            'Total number of GitHub API calls',
            ['operation', 'status']
        )
        self.rate_limit_remaining = Gauge(
            'github_rate_limit_remaining',
            'Remaining GitHub API rate limit'
        )
        
        logger.info(f"Initialized GitHub service with base URL: {base_url}")

    async def __aenter__(self):
        """Async context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup"""
        await self._session.close()

    def _check_rate_limit(self) -> bool:
        """
        Check GitHub API rate limit status.
        
        Returns:
            bool: True if within limits, False otherwise
        """
        rate_limit = self._client.get_rate_limit()
        remaining = rate_limit.core.remaining
        self.rate_limit_remaining.set(remaining)
        
        if remaining < 100:
            logger.warning(f"GitHub API rate limit low: {remaining} remaining")
            return False
        return True

    async def sync_detection(
        self,
        detection: Detection,
        repo_name: str,
        branch: str = "main",
        create_pr: bool = True,
        reviewers: List[str] = None
    ) -> Dict:
        """
        Synchronize detection rule with GitHub repository.
        
        Args:
            detection: Detection model instance
            repo_name: Target repository name
            branch: Target branch name
            create_pr: Whether to create pull request
            reviewers: List of GitHub usernames for review
            
        Returns:
            dict: Sync operation results
        """
        try:
            # Validate rate limits
            if not self._check_rate_limit():
                raise Exception("GitHub API rate limit exceeded")

            # Validate detection content
            if not detection.validate_content():
                raise ValueError("Invalid detection content")

            # Get repository and create feature branch
            repo = self._client.get_repo(repo_name)
            feature_branch = f"detection/{detection.id}"
            
            # Create new branch from main
            try:
                source = repo.get_branch(branch)
                repo.create_git_ref(
                    ref=f"refs/heads/{feature_branch}",
                    sha=source.commit.sha
                )
            except GithubException as e:
                if e.status != 422:  # Branch already exists
                    raise

            # Prepare detection content
            file_path = f"detections/{detection.platform.value}/{detection.id}.json"
            content = base64.b64encode(
                json.dumps(detection.to_dict(), indent=2).encode()
            ).decode()

            # Create or update file
            try:
                file = repo.get_contents(file_path, ref=feature_branch)
                commit_message = f"Update detection {detection.name}"
                repo.update_file(
                    path=file_path,
                    message=commit_message,
                    content=content,
                    sha=file.sha,
                    branch=feature_branch
                )
            except GithubException:
                commit_message = f"Add detection {detection.name}"
                repo.create_file(
                    path=file_path,
                    message=commit_message,
                    content=content,
                    branch=feature_branch
                )

            result = {
                "status": "success",
                "detection_id": str(detection.id),
                "branch": feature_branch,
                "file_path": file_path
            }

            # Create pull request if requested
            if create_pr:
                pr = repo.create_pull(
                    title=f"Detection: {detection.name}",
                    body=self._generate_pr_description(detection),
                    base=branch,
                    head=feature_branch
                )
                
                # Add reviewers if specified
                if reviewers:
                    pr.add_to_reviewers(reviewers)
                
                result["pull_request"] = {
                    "number": pr.number,
                    "url": pr.html_url
                }

            # Update metrics
            self.api_calls_total.labels(
                operation="sync_detection",
                status="success"
            ).inc()

            logger.info(f"Successfully synced detection {detection.id} to GitHub")
            return result

        except Exception as e:
            # Update error metrics
            self.api_calls_total.labels(
                operation="sync_detection",
                status="error"
            ).inc()
            
            logger.error(f"Failed to sync detection {detection.id}: {str(e)}")
            raise

    async def batch_sync_detections(
        self,
        detections: List[Detection],
        repo_name: str,
        branch: str = "main"
    ) -> Dict:
        """
        Synchronize multiple detections in a single operation.
        
        Args:
            detections: List of Detection instances
            repo_name: Target repository name
            branch: Target branch name
            
        Returns:
            dict: Batch operation results
        """
        results = {
            "successful": [],
            "failed": [],
            "total": len(detections)
        }
        
        try:
            # Group detections by platform
            platform_groups = {}
            for detection in detections:
                platform = detection.platform.value
                if platform not in platform_groups:
                    platform_groups[platform] = []
                platform_groups[platform].append(detection)

            # Process each platform group
            for platform, group in platform_groups.items():
                feature_branch = f"batch-update/{platform}/{datetime.now().strftime('%Y%m%d-%H%M%S')}"
                
                # Create batch branch
                repo = self._client.get_repo(repo_name)
                source = repo.get_branch(branch)
                repo.create_git_ref(
                    ref=f"refs/heads/{feature_branch}",
                    sha=source.commit.sha
                )

                # Process detections in group
                for detection in group:
                    try:
                        result = await self.sync_detection(
                            detection=detection,
                            repo_name=repo_name,
                            branch=feature_branch,
                            create_pr=False
                        )
                        results["successful"].append({
                            "detection_id": str(detection.id),
                            "file_path": result["file_path"]
                        })
                    except Exception as e:
                        results["failed"].append({
                            "detection_id": str(detection.id),
                            "error": str(e)
                        })

                # Create consolidated pull request
                if results["successful"]:
                    pr = repo.create_pull(
                        title=f"Batch Update: {platform} Detections",
                        body=self._generate_batch_pr_description(results["successful"]),
                        base=branch,
                        head=feature_branch
                    )
                    results["pull_request"] = {
                        "number": pr.number,
                        "url": pr.html_url
                    }

            return results

        except Exception as e:
            logger.error(f"Failed batch sync operation: {str(e)}")
            raise

    def _generate_pr_description(self, detection: Detection) -> str:
        """Generate detailed pull request description"""
        return f"""
## Detection Update

**Name:** {detection.name}
**Platform:** {detection.platform.value}
**MITRE Mappings:** {', '.join(detection.mitre_mapping.keys())}

### Changes
- Updated detection logic and metadata
- Validated against platform schema
- Added MITRE ATT&CK mappings

### Validation Status
{json.dumps(detection.validation_results, indent=2)}
        """

    def _generate_batch_pr_description(self, successful_updates: List[Dict]) -> str:
        """Generate description for batch update pull request"""
        return f"""
## Batch Detection Update

**Total Updates:** {len(successful_updates)}

### Updated Detections
{chr(10).join(f'- {update["file_path"]}' for update in successful_updates)}

### Validation
All detections have been validated against their respective platform schemas.
        """

    def get_metrics(self) -> Dict:
        """
        Get current service metrics.
        
        Returns:
            dict: Current metric values
        """
        return {
            "api_calls": {
                "total": self.api_calls_total._value.get(),
                "success": self.api_calls_total.labels(
                    operation="sync_detection",
                    status="success"
                )._value.get(),
                "error": self.api_calls_total.labels(
                    operation="sync_detection",
                    status="error"
                )._value.get()
            },
            "rate_limit_remaining": self.rate_limit_remaining._value.get()
        }