package net.mrchar.corn.model.projection;

import net.mrchar.corn.model.Space;
import net.mrchar.corn.model.base.AuditingProjection;
import org.springframework.data.rest.core.config.Projection;

@Projection(name = "info", types = {Space.class})
public interface SpaceProjection extends AuditingProjection {
    String getCode();

    String getName();
}
