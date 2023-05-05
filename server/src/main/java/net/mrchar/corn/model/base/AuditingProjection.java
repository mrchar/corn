package net.mrchar.corn.model.base;

import java.time.LocalDateTime;

public interface AuditingProjection {
    Long getId();

    LocalDateTime getCreated();

    LocalDateTime getModified();
}
