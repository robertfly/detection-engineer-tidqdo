# External imports - versions specified for security tracking
from typing import Dict, Any, Optional, List, Union, Tuple  # python 3.11+
from pydantic import ValidationError  # pydantic 2.0+
import re  # standard library
from cachetools import TTLCache  # cachetools 5.3+
import logging  # standard library

# Internal imports
from app.utils.validation import validate_detection_format
from app.utils.rate_limiting import RateLimiter

# Configure logging
logger = logging.getLogger(__name__)

# Global constants for KQL translation
KQL_OPERATORS = {
    "equals": "==",
    "contains": "contains",
    "startswith": "startswith",
    "endswith": "endswith",
    "regex": "matches regex",
    "in": "in",
    "notin": "!in",
    "like": "matches pattern"
}

KQL_FIELD_MAPPINGS = {
    "process": {
        "name": "ProcessName",
        "id": "ProcessId",
        "commandline": "ProcessCommandLine",
        "path": "ProcessPath",
        "parent_id": "ParentProcessId",
        "parent_name": "ParentProcessName"
    },
    "file": {
        "path": "FilePath",
        "name": "FileName",
        "hash": {
            "md5": "MD5",
            "sha1": "SHA1",
            "sha256": "SHA256"
        },
        "size": "FileSize"
    },
    "network": {
        "source": {
            "ip": "SourceIP",
            "port": "SourcePort"
        },
        "destination": {
            "ip": "DestinationIP",
            "port": "DestinationPort"
        },
        "protocol": "Protocol"
    },
    "registry": {
        "path": "RegistryPath",
        "key": "RegistryKey",
        "value": "RegistryValue"
    }
}

# KQL syntax validation patterns
KQL_SYNTAX_PATTERNS = {
    "table_pattern": r"^\w+",
    "where_pattern": r"where[\s\w\d\(\)]+",
    "project_pattern": r"project[\s\w\d,]+$",
    "join_pattern": r"join[\s\w\d]+on",
    "function_pattern": r"\w+\(.*\)"
}

# Performance limits for KQL queries
KQL_PERFORMANCE_LIMITS = {
    "max_complexity": 100,  # Maximum query complexity score
    "max_joins": 3,        # Maximum number of joins
    "max_functions": 5,    # Maximum number of function calls
    "timeout_seconds": 30  # Query timeout threshold
}

class KQLTranslator:
    """
    Advanced translator class for Microsoft Sentinel KQL format conversions with 
    caching, validation, and optimization capabilities.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize KQL translator with comprehensive mappings and configurations.

        Args:
            config: Optional configuration dictionary
        """
        # Initialize field and operator mappings
        self._field_mappings = KQL_FIELD_MAPPINGS
        self._operator_mappings = KQL_OPERATORS

        # Configure caching with TTL
        self._cache = TTLCache(
            maxsize=1000,
            ttl=300  # 5 minute cache TTL
        )

        # Initialize rate limiter for API compliance
        self._rate_limiter = RateLimiter(
            default_limit=100,  # 100 requests per minute per Microsoft Sentinel limits
            window_seconds=60
        )

        # Set up logging
        self._logger = logging.getLogger(__name__)
        self._logger.setLevel(logging.INFO)

        # Load custom configurations if provided
        if config:
            self._load_config(config)

    def _load_config(self, config: Dict[str, Any]) -> None:
        """Load custom configurations and mappings."""
        if "field_mappings" in config:
            self._field_mappings.update(config["field_mappings"])
        if "operator_mappings" in config:
            self._operator_mappings.update(config["operator_mappings"])

    async def translate(
        self,
        detection_logic: Dict[str, Any],
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Translates detection logic to optimized KQL format with caching.

        Args:
            detection_logic: Universal detection format logic
            options: Optional translation options

        Returns:
            Dict containing translated KQL query and metadata

        Raises:
            ValidationError: If detection format is invalid
            ValueError: If translation fails
        """
        try:
            # Check rate limits
            is_limited, _, _, retry_after = await self._rate_limiter.is_rate_limited(
                "kql_translation", "translate"
            )
            if is_limited:
                raise ValueError(f"Rate limit exceeded. Retry after {retry_after} seconds")

            # Validate input format
            valid, error_msg, _ = validate_detection_format(detection_logic)
            if not valid:
                raise ValidationError(error_msg)

            # Check cache
            cache_key = str(detection_logic)
            if cache_key in self._cache:
                self._logger.info("Cache hit for KQL translation")
                return self._cache[cache_key]

            # Extract query components
            data_model = detection_logic.get("data_model", {})
            conditions = detection_logic.get("conditions", {})
            
            # Build KQL query
            kql_parts = []
            
            # Add table reference
            table_name = self._get_table_name(data_model)
            kql_parts.append(table_name)
            
            # Process conditions
            where_clause = self._build_where_clause(conditions)
            if where_clause:
                kql_parts.append(f"| where {where_clause}")
            
            # Add field projections
            projections = self._get_field_projections(data_model)
            if projections:
                kql_parts.append(f"| project {', '.join(projections)}")
            
            # Combine query parts
            kql_query = "\n".join(kql_parts)
            
            # Validate and optimize query
            valid, error, metrics = self.validate_kql(kql_query)
            if not valid:
                raise ValueError(f"Invalid KQL query: {error}")
            
            # Prepare response
            result = {
                "query": kql_query,
                "platform": "Microsoft Sentinel",
                "performance_metrics": metrics,
                "field_mappings": self._get_used_mappings(detection_logic)
            }
            
            # Cache successful translation
            self._cache[cache_key] = result
            
            return result

        except Exception as e:
            self._logger.error(f"KQL translation error: {str(e)}")
            raise

    def validate_kql(
        self,
        kql_query: str,
        validation_options: Optional[Dict[str, Any]] = None
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """
        Comprehensive KQL syntax and performance validation.

        Args:
            kql_query: KQL query to validate
            validation_options: Optional validation parameters

        Returns:
            Tuple containing:
            - bool: Validation success
            - Optional[str]: Error message if validation failed
            - Optional[Dict[str, Any]]: Performance metrics
        """
        try:
            # Initialize metrics
            metrics = {
                "complexity_score": 0,
                "join_count": 0,
                "function_count": 0
            }

            # Validate basic syntax
            if not kql_query.strip():
                return False, "Empty query", None

            # Check table reference
            table_match = re.match(KQL_SYNTAX_PATTERNS["table_pattern"], kql_query)
            if not table_match:
                return False, "Invalid table reference", None

            # Count joins
            joins = re.findall(KQL_SYNTAX_PATTERNS["join_pattern"], kql_query)
            metrics["join_count"] = len(joins)
            if metrics["join_count"] > KQL_PERFORMANCE_LIMITS["max_joins"]:
                return False, f"Too many joins: {metrics['join_count']}", metrics

            # Count functions
            functions = re.findall(KQL_SYNTAX_PATTERNS["function_pattern"], kql_query)
            metrics["function_count"] = len(functions)
            if metrics["function_count"] > KQL_PERFORMANCE_LIMITS["max_functions"]:
                return False, f"Too many functions: {metrics['function_count']}", metrics

            # Calculate complexity score
            metrics["complexity_score"] = self._calculate_complexity(kql_query)
            if metrics["complexity_score"] > KQL_PERFORMANCE_LIMITS["max_complexity"]:
                return False, f"Query too complex: {metrics['complexity_score']}", metrics

            return True, None, metrics

        except Exception as e:
            self._logger.error(f"KQL validation error: {str(e)}")
            return False, str(e), None

    async def translate_from_kql(
        self,
        kql_query: str,
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Converts KQL detection to universal format with optimization.

        Args:
            kql_query: KQL query to convert
            options: Optional conversion options

        Returns:
            Dict containing universal detection format
        """
        try:
            # Check rate limits
            is_limited, _, _, retry_after = await self._rate_limiter.is_rate_limited(
                "kql_translation", "translate_from_kql"
            )
            if is_limited:
                raise ValueError(f"Rate limit exceeded. Retry after {retry_after} seconds")

            # Validate KQL syntax
            valid, error, _ = self.validate_kql(kql_query)
            if not valid:
                raise ValueError(f"Invalid KQL query: {error}")

            # Parse query components
            table_name = self._extract_table(kql_query)
            conditions = self._extract_conditions(kql_query)
            fields = self._extract_fields(kql_query)

            # Convert to universal format
            detection_logic = {
                "data_model": {
                    "source": table_name,
                    "fields": fields
                },
                "conditions": conditions,
                "platform_specific": {
                    "kql": {
                        "original_query": kql_query
                    }
                }
            }

            # Validate converted format
            valid, error_msg, _ = validate_detection_format({"logic": detection_logic})
            if not valid:
                raise ValueError(f"Conversion validation failed: {error_msg}")

            return detection_logic

        except Exception as e:
            self._logger.error(f"KQL to universal format conversion error: {str(e)}")
            raise

    def _get_table_name(self, data_model: Dict[str, Any]) -> str:
        """Determine appropriate KQL table name from data model."""
        source = data_model.get("source", "").lower()
        table_mappings = {
            "process": "SecurityEvent",
            "file": "FileEvents",
            "network": "NetworkConnection",
            "registry": "RegistryEvents"
        }
        return table_mappings.get(source, "SecurityEvent")

    def _build_where_clause(self, conditions: Dict[str, Any]) -> str:
        """Build KQL where clause from conditions."""
        if not conditions:
            return ""

        clauses = []
        for field, condition in conditions.items():
            mapped_field = self._map_field(field)
            operator = condition.get("operator", "equals")
            value = condition.get("value")

            if operator in self._operator_mappings:
                kql_operator = self._operator_mappings[operator]
                clauses.append(f"{mapped_field} {kql_operator} {self._format_value(value)}")

        return " and ".join(clauses)

    def _map_field(self, field: str) -> str:
        """Map universal field name to KQL field name."""
        parts = field.split(".")
        current = self._field_mappings
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return field
        return current if isinstance(current, str) else field

    def _format_value(self, value: Any) -> str:
        """Format value for KQL query."""
        if isinstance(value, str):
            return f"'{value}'"
        elif isinstance(value, list):
            return f"({', '.join(map(self._format_value, value))})"
        return str(value)

    def _calculate_complexity(self, query: str) -> int:
        """Calculate query complexity score."""
        score = 0
        score += len(re.findall(r'\|', query)) * 5  # Pipe operations
        score += len(re.findall(KQL_SYNTAX_PATTERNS["join_pattern"], query)) * 10  # Joins
        score += len(re.findall(KQL_SYNTAX_PATTERNS["function_pattern"], query)) * 3  # Functions
        score += len(re.findall(r'where', query)) * 2  # Where clauses
        return score

    def _get_used_mappings(self, detection_logic: Dict[str, Any]) -> Dict[str, str]:
        """Get field mappings used in the detection."""
        used_mappings = {}
        if "conditions" in detection_logic:
            for field in detection_logic["conditions"]:
                mapped_field = self._map_field(field)
                if mapped_field != field:
                    used_mappings[field] = mapped_field
        return used_mappings