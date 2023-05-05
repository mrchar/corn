package net.mrchar.corn.model.projection;

import net.mrchar.corn.model.Space;
import org.springframework.data.rest.core.config.Projection;

import java.time.LocalDateTime;

@Projection(name = "info", types = {Space.class})
public interface SpaceProjection {
    Long getId();

    String getCode();

    String getName();

    LocalDateTime getCreated();

    LocalDateTime getModified();
}
