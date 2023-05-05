package net.mrchar.corn.model.projection;

import net.mrchar.corn.model.Action;
import net.mrchar.corn.model.Space;
import net.mrchar.corn.model.base.AuditingProjection;
import net.mrchar.corn.model.element.Label;
import org.springframework.data.rest.core.config.Projection;

import java.util.Set;

@Projection(name = "info", types = {Action.class})
public interface ActionProjection extends AuditingProjection {
    Space getSpace();

    Action getParent();

    String getName();

    Set<Label> getLabels();

    Set<Action> getChildren();
}
