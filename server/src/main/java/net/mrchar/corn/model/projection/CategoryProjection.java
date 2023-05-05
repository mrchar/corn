package net.mrchar.corn.model.projection;

import net.mrchar.corn.model.Category;
import net.mrchar.corn.model.base.AuditingProjection;
import org.springframework.data.rest.core.config.Projection;

@Projection(name = "info", types = Category.class)
public interface CategoryProjection extends AuditingProjection {
    String getCode();

    String getName();

    String getUnit();
}
