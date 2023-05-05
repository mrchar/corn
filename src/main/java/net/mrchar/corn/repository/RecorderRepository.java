package net.mrchar.corn.repository;

import net.mrchar.corn.model.Recorder;
import net.mrchar.corn.model.projection.RecorderProjection;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

@RepositoryRestResource(path = "recorders", excerptProjection = RecorderProjection.class)
public interface RecorderRepository extends CrudRepository<Recorder, Long> {
}
