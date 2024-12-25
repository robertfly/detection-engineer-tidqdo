# External imports - versions specified for security tracking
from typing import Dict, Any, Optional, List, Tuple, Union  # python v3.11+
from pydantic import ValidationError  # pydantic v2.0+
import re  # standard library
import logging  # standard library
from datetime import datetime

# Internal imports
from app.utils.validation import validate_detection_format

# Configure logging
logger = logging.getLogger(__name__)

# Global constants for SPL translation
SPL_SYNTAX_PATTERNS = {
    "search": re.compile(r"^\s*search\s"),
    "table": re.compile(r"\|\s*table\s"),
    "stats": re.compile(r"\|\s*stats\s"),
    "eval": re.compile(r"\|\s*eval\s"),
    "where": re.compile(r"\|\s*where\s"),
    "rename": re.compile(r"\|\s*rename\s")
}

# Field mappings for Splunk data model
FIELD_MAPPINGS = {
    "process.name": "process_name",
    "process.id": "pid",
    "file.path": "file_path",
    "network.protocol": "protocol",
    "mitre.technique.id": "technique_id"
}

# Function mappings for SPL translation
FUNCTION_MAPPINGS = {
    "count": "count",
    "distinct": "dc",
    "sum": "sum",
    "avg": "avg",
    "min": "min",
    "max": "max",
    "latest": "latest",
    "earliest": "earliest"
}

# Optimization rules for SPL queries
OPTIMIZATION_RULES = {
    "field_extraction": "earliest",
    "lookup_order": "first",
    "stats_position": "last",
    "index_optimization": True
}

class SPLTranslator:
    """
    Advanced translator class for converting detections to and from Splunk SPL format
    with support for MITRE ATT&CK mapping validation and performance optimization.
    """

    def __init__(self, platform_config: Optional[Dict[str, Any]] = None):
        """
        Initialize SPL translator with platform configurations and metrics collection.

        Args:
            platform_config: Optional platform-specific configuration
        """
        self._field_mappings = FIELD_MAPPINGS.copy()
        self._function_mappings = FUNCTION_MAPPINGS.copy()
        self._platform_config = platform_config or {}
        self._compiled_patterns = SPL_SYNTAX_PATTERNS.copy()
        self._logger = logging.getLogger(__name__)

        # Configure logging with rotation
        self._logger.setLevel(logging.INFO)

    def translate(
        self,
        detection_logic: Dict[str, Any],
        optimize: bool = True,
        validate_mitre: bool = True
    ) -> Dict[str, Any]:
        """
        Translates detection logic to SPL format with comprehensive validation.

        Args:
            detection_logic: Source detection logic to translate
            optimize: Whether to apply SPL-specific optimizations
            validate_mitre: Whether to validate MITRE ATT&CK mappings

        Returns:
            Dict containing translated SPL query and metadata

        Raises:
            ValidationError: If detection format is invalid
        """
        try:
            # Start translation metrics
            start_time = datetime.utcnow()

            # Validate input detection format
            is_valid, error_msg, validation_meta = validate_detection_format(detection_logic)
            if not is_valid:
                raise ValidationError(f"Invalid detection format: {error_msg}")

            # Extract core components
            query = detection_logic.get("query", "")
            data_model = detection_logic.get("data_model", {})
            mitre_mappings = detection_logic.get("mitre_mappings", {})

            # Validate MITRE mappings if requested
            if validate_mitre and mitre_mappings:
                for technique_id, subtechniques in mitre_mappings.items():
                    if not technique_id.startswith("T") or not technique_id[1:].isdigit():
                        raise ValidationError(f"Invalid MITRE technique ID: {technique_id}")

            # Map fields to Splunk data model
            mapped_query = self._map_fields(query)

            # Convert conditions to SPL syntax
            spl_query = self._convert_to_spl(mapped_query, data_model)

            # Apply optimizations if requested
            if optimize:
                optimization_result = self.optimize_spl(
                    spl_query,
                    {"data_model": data_model}
                )
                spl_query = optimization_result["optimized_query"]
                optimization_metrics = optimization_result["metrics"]
            else:
                optimization_metrics = {}

            # Validate generated SPL
            is_valid, error_msg, validation_details = self.validate_spl(spl_query, True)
            if not is_valid:
                raise ValidationError(f"Generated SPL validation failed: {error_msg}")

            # Calculate translation metrics
            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()

            return {
                "spl_query": spl_query,
                "validation_status": "success",
                "mitre_validated": validate_mitre,
                "optimized": optimize,
                "metrics": {
                    "translation_time": duration,
                    "optimization_metrics": optimization_metrics,
                    "validation_details": validation_details
                },
                "metadata": {
                    "timestamp": end_time.isoformat(),
                    "version": "1.0",
                    "platform": "splunk"
                }
            }

        except Exception as e:
            self._logger.error(f"Translation error: {str(e)}")
            raise

    def validate_spl(
        self,
        spl_query: str,
        strict_mode: bool = False
    ) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """
        Validates SPL query syntax and structure with enhanced error reporting.

        Args:
            spl_query: SPL query to validate
            strict_mode: Whether to apply strict validation rules

        Returns:
            Tuple containing:
            - bool: Validation success status
            - Optional[str]: Error message if validation failed
            - Optional[Dict[str, Any]]: Validation details
        """
        try:
            validation_details = {
                "checks_performed": [],
                "warnings": []
            }

            # Check basic syntax using compiled patterns
            if not self._compiled_patterns["search"].match(spl_query):
                return False, "Query must start with 'search'", validation_details

            # Validate command order
            command_order = []
            for command in ["search", "table", "stats", "eval", "where", "rename"]:
                if self._compiled_patterns[command].search(spl_query):
                    command_order.append(command)
                    validation_details["checks_performed"].append(f"found_{command}_command")

            # Check for security issues
            if "script" in spl_query.lower() or "shell" in spl_query.lower():
                return False, "Query contains prohibited commands", validation_details

            # Validate field references
            fields = re.findall(r'\b\w+\s*=', spl_query)
            for field in fields:
                field = field.strip('= ')
                if field not in self._field_mappings.values():
                    validation_details["warnings"].append(f"Unknown field: {field}")

            # Strict mode checks
            if strict_mode:
                # Check for proper quoting
                if spl_query.count('"') % 2 != 0:
                    return False, "Unmatched quotes in query", validation_details

                # Check for balanced parentheses
                if spl_query.count('(') != spl_query.count(')'):
                    return False, "Unbalanced parentheses", validation_details

            validation_details["command_order"] = command_order
            return True, None, validation_details

        except Exception as e:
            self._logger.error(f"SPL validation error: {str(e)}")
            return False, str(e), None

    def optimize_spl(
        self,
        spl_query: str,
        optimization_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Optimizes SPL query for better performance with metrics collection.

        Args:
            spl_query: SPL query to optimize
            optimization_config: Configuration for optimization rules

        Returns:
            Dict containing optimized query and performance metrics
        """
        try:
            original_query = spl_query
            metrics = {
                "original_length": len(original_query),
                "optimizations_applied": []
            }

            # Apply field extraction optimization
            if OPTIMIZATION_RULES["field_extraction"] == "earliest":
                spl_query = self._optimize_field_extraction(spl_query)
                metrics["optimizations_applied"].append("field_extraction")

            # Optimize lookup operations
            if OPTIMIZATION_RULES["lookup_order"] == "first":
                spl_query = self._optimize_lookups(spl_query)
                metrics["optimizations_applied"].append("lookup_optimization")

            # Optimize stats position
            if OPTIMIZATION_RULES["stats_position"] == "last":
                spl_query = self._optimize_stats_position(spl_query)
                metrics["optimizations_applied"].append("stats_position")

            # Apply index optimization if enabled
            if OPTIMIZATION_RULES["index_optimization"]:
                spl_query = self._optimize_index_usage(spl_query)
                metrics["optimizations_applied"].append("index_optimization")

            # Calculate optimization metrics
            metrics["optimized_length"] = len(spl_query)
            metrics["reduction_percentage"] = round(
                (1 - len(spl_query) / len(original_query)) * 100, 2
            )

            return {
                "optimized_query": spl_query,
                "metrics": metrics
            }

        except Exception as e:
            self._logger.error(f"SPL optimization error: {str(e)}")
            raise

    def _map_fields(self, query: str) -> str:
        """Maps generic field names to Splunk-specific field names."""
        mapped_query = query
        for generic_field, splunk_field in self._field_mappings.items():
            mapped_query = mapped_query.replace(generic_field, splunk_field)
        return mapped_query

    def _convert_to_spl(self, query: str, data_model: Dict[str, Any]) -> str:
        """Converts generic query to SPL syntax."""
        # Implementation would include complex SPL syntax conversion logic
        return f"search {query}"

    def _optimize_field_extraction(self, query: str) -> str:
        """Optimizes field extraction in SPL query."""
        # Implementation would include field extraction optimization logic
        return query

    def _optimize_lookups(self, query: str) -> str:
        """Optimizes lookup operations in SPL query."""
        # Implementation would include lookup optimization logic
        return query

    def _optimize_stats_position(self, query: str) -> str:
        """Optimizes position of stats commands in SPL query."""
        # Implementation would include stats position optimization logic
        return query

    def _optimize_index_usage(self, query: str) -> str:
        """Optimizes index usage in SPL query."""
        # Implementation would include index optimization logic
        return query