# External imports - versions specified for security tracking
from typing import Dict, Any, Optional, List, Tuple  # python v3.11+
from pydantic import ValidationError  # pydantic v2.0+
import yaml  # pyyaml v6.0+
from sigma import sigma  # sigma-cli v0.9+
import logging
from datetime import datetime
from functools import lru_cache

# Internal imports
from app.utils.validation import validate_detection_format

# Configure logging
logger = logging.getLogger(__name__)

# Global constants for SIGMA validation and processing
SIGMA_REQUIRED_FIELDS = ["title", "description", "logsource", "detection", "level", "status"]
SIGMA_PLATFORMS = ["windows", "linux", "macos", "network", "cloud"]
SIGMA_VALIDATION_THRESHOLDS = {
    "max_complexity": 100,  # Maximum allowed rule complexity score
    "max_fields": 50,      # Maximum number of fields in a rule
    "max_conditions": 20   # Maximum number of conditions per rule
}

class SigmaTranslator:
    """
    Enterprise-grade translator for converting detections to and from SIGMA format
    with comprehensive validation, security checks, and performance optimization.
    """

    def __init__(self, config: Optional[Dict] = None):
        """
        Initialize SIGMA translator with configuration and caching.

        Args:
            config: Optional configuration dictionary for customizing translator behavior
        """
        self._config = config or {}
        self._translation_cache = {}
        self._platform_mappings = self._initialize_platform_mappings()
        
        # Initialize SIGMA parser with security settings
        self._parser_config = {
            "secure_mode": True,
            "max_recursion_depth": 5,
            "allow_wildcards": False,
            "validate_identifiers": True
        }
        
        logger.info("Initialized SIGMA translator with secure configuration")

    def _initialize_platform_mappings(self) -> Dict[str, Dict[str, str]]:
        """Initialize standardized field mappings for different platforms."""
        return {
            "windows": {
                "process_creation": "Microsoft-Windows-Security-Auditing",
                "file_creation": "Microsoft-Windows-Sysmon",
                "network_connection": "Microsoft-Windows-Sysmon"
            },
            "linux": {
                "process_creation": "auditd",
                "file_creation": "auditd",
                "network_connection": "auditd"
            },
            "macos": {
                "process_creation": "Security",
                "file_creation": "Security",
                "network_connection": "Security"
            }
        }

    @lru_cache(maxsize=1000)
    def translate_to_sigma(self, detection: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert internal detection format to SIGMA rule with validation.

        Args:
            detection: Detection rule in internal format

        Returns:
            Dict[str, Any]: SIGMA formatted detection rule

        Raises:
            ValidationError: If detection format is invalid
            ValueError: If conversion fails validation
        """
        try:
            # Validate input detection format
            valid, error_msg, _ = validate_detection_format(detection)
            if not valid:
                raise ValidationError(f"Invalid detection format: {error_msg}")

            # Check cache for existing translation
            cache_key = str(hash(str(detection)))
            if cache_key in self._translation_cache:
                logger.debug("Retrieved SIGMA translation from cache")
                return self._translation_cache[cache_key]

            # Extract core detection components
            metadata = detection.get("metadata", {})
            logic = detection.get("logic", {})
            mitre_mappings = detection.get("mitre_mappings", {})

            # Construct SIGMA rule structure
            sigma_rule = {
                "title": detection["name"],
                "id": str(detection.get("id", "")),
                "status": "experimental",
                "description": detection.get("description", ""),
                "references": [],
                "tags": [],
                "author": metadata.get("author", ""),
                "date": datetime.utcnow().strftime("%Y/%m/%d"),
                "modified": datetime.utcnow().strftime("%Y/%m/%d"),
                "logsource": self._translate_logsource(logic.get("data_model", {})),
                "detection": self._translate_detection_logic(logic.get("query", {})),
                "falsepositives": metadata.get("false_positives", []),
                "level": metadata.get("severity", "medium"),
                "tags": self._generate_sigma_tags(mitre_mappings)
            }

            # Validate generated SIGMA rule
            valid, error_msg, _ = self.validate_sigma(sigma_rule)
            if not valid:
                raise ValueError(f"Generated SIGMA rule validation failed: {error_msg}")

            # Cache successful translation
            self._translation_cache[cache_key] = sigma_rule
            
            logger.info(f"Successfully translated detection {detection.get('id', '')} to SIGMA format")
            return sigma_rule

        except Exception as e:
            logger.error(f"SIGMA translation error: {str(e)}")
            raise

    def translate_from_sigma(self, sigma_rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert SIGMA rule to internal detection format with validation.

        Args:
            sigma_rule: SIGMA formatted detection rule

        Returns:
            Dict[str, Any]: Internal detection format

        Raises:
            ValidationError: If SIGMA rule is invalid
            ValueError: If conversion fails validation
        """
        try:
            # Validate SIGMA rule format
            valid, error_msg, _ = self.validate_sigma(sigma_rule)
            if not valid:
                raise ValidationError(f"Invalid SIGMA rule: {error_msg}")

            # Check cache for existing translation
            cache_key = str(hash(str(sigma_rule)))
            if cache_key in self._translation_cache:
                logger.debug("Retrieved internal format translation from cache")
                return self._translation_cache[cache_key]

            # Convert to internal format
            detection = {
                "name": sigma_rule["title"],
                "description": sigma_rule.get("description", ""),
                "metadata": {
                    "author": sigma_rule.get("author", ""),
                    "created_date": sigma_rule.get("date", ""),
                    "modified_date": sigma_rule.get("modified", ""),
                    "severity": sigma_rule.get("level", "medium"),
                    "false_positives": sigma_rule.get("falsepositives", [])
                },
                "logic": {
                    "query": self._translate_sigma_detection(sigma_rule["detection"]),
                    "data_model": self._translate_sigma_logsource(sigma_rule["logsource"])
                },
                "mitre_mappings": self._extract_mitre_mappings(sigma_rule.get("tags", []))
            }

            # Validate converted detection
            valid, error_msg, _ = validate_detection_format(detection)
            if not valid:
                raise ValueError(f"Converted detection validation failed: {error_msg}")

            # Cache successful translation
            self._translation_cache[cache_key] = detection
            
            logger.info(f"Successfully translated SIGMA rule {sigma_rule.get('id', '')} to internal format")
            return detection

        except Exception as e:
            logger.error(f"SIGMA translation error: {str(e)}")
            raise

    def validate_sigma(self, sigma_rule: Dict[str, Any]) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """
        Validate SIGMA rule syntax, structure, and security implications.

        Args:
            sigma_rule: SIGMA rule to validate

        Returns:
            Tuple containing:
            - bool: Validation success status
            - Optional[str]: Error message if validation failed
            - Dict[str, Any]: Validation details
        """
        try:
            # Check required fields
            missing_fields = [
                field for field in SIGMA_REQUIRED_FIELDS
                if field not in sigma_rule
            ]
            if missing_fields:
                return False, f"Missing required fields: {', '.join(missing_fields)}", {}

            # Validate logsource configuration
            logsource = sigma_rule.get("logsource", {})
            if not any(key in logsource for key in ["product", "service", "category"]):
                return False, "Invalid logsource configuration", {}

            # Validate detection logic
            detection = sigma_rule.get("detection", {})
            if not detection or not isinstance(detection, dict):
                return False, "Invalid detection logic", {}

            # Check complexity thresholds
            complexity_score = self._calculate_rule_complexity(detection)
            if complexity_score > SIGMA_VALIDATION_THRESHOLDS["max_complexity"]:
                return False, "Rule complexity exceeds maximum threshold", {}

            # Validate field count
            field_count = self._count_detection_fields(detection)
            if field_count > SIGMA_VALIDATION_THRESHOLDS["max_fields"]:
                return False, "Number of fields exceeds maximum threshold", {}

            # Generate validation metadata
            validation_meta = {
                "timestamp": datetime.utcnow().isoformat(),
                "complexity_score": complexity_score,
                "field_count": field_count,
                "platform_compatibility": self._check_platform_compatibility(logsource)
            }

            return True, None, validation_meta

        except Exception as e:
            logger.error(f"SIGMA validation error: {str(e)}")
            return False, str(e), {}

    def _translate_logsource(self, data_model: Dict[str, Any]) -> Dict[str, Any]:
        """Translate internal data model to SIGMA logsource configuration."""
        platform = data_model.get("platform", "").lower()
        category = data_model.get("category", "")
        
        if platform in self._platform_mappings:
            return {
                "product": platform,
                "service": self._platform_mappings[platform].get(category, ""),
                "category": category
            }
        return {"category": category}

    def _translate_detection_logic(self, query: Dict[str, Any]) -> Dict[str, Any]:
        """Translate internal query logic to SIGMA detection format."""
        return {
            "selection": query.get("conditions", {}),
            "condition": query.get("pattern", "selection")
        }

    def _generate_sigma_tags(self, mitre_mappings: Dict[str, List[str]]) -> List[str]:
        """Generate SIGMA tags from MITRE ATT&CK mappings."""
        tags = []
        for technique_id, subtechniques in mitre_mappings.items():
            tags.append(f"attack.t{technique_id[1:]}")
            for subtechnique in subtechniques:
                tags.append(f"attack.t{subtechnique[1:]}")
        return tags

    def _translate_sigma_detection(self, detection: Dict[str, Any]) -> Dict[str, Any]:
        """Translate SIGMA detection logic to internal query format."""
        return {
            "conditions": detection.get("selection", {}),
            "pattern": detection.get("condition", "")
        }

    def _translate_sigma_logsource(self, logsource: Dict[str, Any]) -> Dict[str, Any]:
        """Translate SIGMA logsource to internal data model."""
        return {
            "platform": logsource.get("product", ""),
            "category": logsource.get("category", ""),
            "service": logsource.get("service", "")
        }

    def _extract_mitre_mappings(self, tags: List[str]) -> Dict[str, List[str]]:
        """Extract MITRE ATT&CK mappings from SIGMA tags."""
        mappings = {}
        for tag in tags:
            if tag.startswith("attack.t"):
                technique_id = f"T{tag[8:]}"  # Remove "attack.t" prefix
                if "." in technique_id:
                    base_technique = technique_id.split(".")[0]
                    if base_technique not in mappings:
                        mappings[base_technique] = []
                    mappings[base_technique].append(technique_id)
                else:
                    if technique_id not in mappings:
                        mappings[technique_id] = []
        return mappings

    def _calculate_rule_complexity(self, detection: Dict[str, Any]) -> int:
        """Calculate complexity score for a SIGMA rule."""
        score = 0
        for selection in detection.values():
            if isinstance(selection, dict):
                score += len(selection)
                score += sum(len(str(v)) for v in selection.values())
        return score

    def _count_detection_fields(self, detection: Dict[str, Any]) -> int:
        """Count total number of fields in a SIGMA detection."""
        field_count = 0
        for selection in detection.values():
            if isinstance(selection, dict):
                field_count += len(selection)
        return field_count

    def _check_platform_compatibility(self, logsource: Dict[str, Any]) -> List[str]:
        """Check platform compatibility for a SIGMA rule."""
        compatible_platforms = []
        product = logsource.get("product", "").lower()
        
        if product in SIGMA_PLATFORMS:
            compatible_platforms.append(product)
        elif "windows" in product:
            compatible_platforms.append("windows")
        elif "linux" in product:
            compatible_platforms.append("linux")
        elif "macos" in product:
            compatible_platforms.append("macos")
            
        return compatible_platforms